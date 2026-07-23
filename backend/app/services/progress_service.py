"""
Progress service — computes skill ratings from analysis history, tracks workout
streaks, and auto-updates progress events when new analyses arrive.
"""

import logging
import uuid
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Analysis, Athlete, TrainingPlan, Workout
from app.models.analysis import AnalysisStatus
from app.models.progress import ProgressEvent, SkillRating

logger = logging.getLogger(__name__)

# The 6 canonical skill categories used across CourtSense AI
SKILL_CATEGORIES = [
    "shooting",
    "dribbling",
    "footwork",
    "defense",
    "passing",
    "basketball_iq",
]

# How much weight to give each analysis (most recent = highest weight).
# Uses an exponential decay: weight = BASE_DECAY ^ (days_ago / HALF_LIFE_DAYS)
HALF_LIFE_DAYS = 30.0
RECENCY_BASE = 0.5  # weight halves every HALF_LIFE_DAYS


async def calculate_skill_ratings(
    athlete_id: uuid.UUID,
    db: AsyncSession,
) -> list[dict[str, Any]]:
    """Compute current skill ratings (1-10) for all 6 categories.

    Sources data from completed analyses' feedback_json.categories, applying
    exponential recency weighting so newer analyses matter more. Falls back to
    the skill_ratings table if no analyses exist.
    """
    # Fetch completed analyses for this athlete, newest first
    result = await db.execute(
        select(Analysis)
        .where(
            Analysis.athlete_id == athlete_id,
            Analysis.status == AnalysisStatus.completed,
            Analysis.feedback_json.isnot(None),
        )
        .order_by(Analysis.created_at.desc())
        .limit(50)  # enough for a meaningful weighted average
    )
    analyses = result.scalars().all()

    if not analyses:
        # Fall back to stored skill_ratings table
        return await _ratings_from_table(athlete_id, db)

    now = datetime.utcnow()
    # Accumulators: {category: (weighted_sum, total_weight)}
    acc: dict[str, tuple[float, float]] = {cat: (0.0, 0.0) for cat in SKILL_CATEGORIES}

    for analysis in analyses:
        feedback = analysis.feedback_json or {}
        categories = feedback.get("categories", {})

        # Compute recency weight
        days_ago = (now - (analysis.completed_at or analysis.created_at)).total_seconds() / 86400.0
        weight = RECENCY_BASE ** (days_ago / HALF_LIFE_DAYS)

        for cat_name, cat_data in categories.items():
            # Map analysis category names to our canonical set
            canonical = _map_category(cat_name)
            if canonical is None:
                continue

            score = None
            if isinstance(cat_data, dict):
                score = cat_data.get("score")
            if score is None:
                continue

            try:
                score_val = float(score)
            except (TypeError, ValueError):
                continue

            prev_sum, prev_weight = acc[canonical]
            acc[canonical] = (prev_sum + score_val * weight, prev_weight + weight)

    # Build result list, fill gaps from the skill_ratings table
    db_ratings = {r.skill_category: r.rating for r in (await db.execute(
        select(SkillRating).where(SkillRating.athlete_id == athlete_id)
    )).scalars().all()}

    ratings = []
    for cat in SKILL_CATEGORIES:
        weighted_sum, total_weight = acc[cat]
        if total_weight > 0:
            rating = round(weighted_sum / total_weight)
            rating = max(1, min(10, rating))
        elif cat in db_ratings:
            rating = db_ratings[cat]
        else:
            rating = 5  # neutral default for new athletes

        ratings.append({
            "skill_category": cat,
            "rating": rating,
        })

    return ratings


async def calculate_streak(
    athlete_id: uuid.UUID,
    db: AsyncSession,
) -> int:
    """Count consecutive days (including today) with at least one completed workout.

    Works backward from today — the first day without a completed workout breaks
    the streak. Today counts if any workout was completed today.
    """
    # Get all completed workouts ordered newest first
    result = await db.execute(
        select(Workout.completed_at)
        .join(TrainingPlan, Workout.plan_id == TrainingPlan.id)
        .where(
            TrainingPlan.athlete_id == athlete_id,
            Workout.completed == True,
            Workout.completed_at.isnot(None),
        )
        .order_by(Workout.completed_at.desc())
    )
    dates = [row[0].date() for row in result.fetchall()]

    if not dates:
        return 0

    streak = 0
    check_date = date.today()

    # Deduplicate dates (multiple workouts on same day count as 1)
    unique_dates = sorted(set(dates), reverse=True)

    for d in unique_dates:
        if d == check_date:
            streak += 1
            check_date = d - timedelta(days=1)
        elif d == check_date - timedelta(days=1):
            # Allow a 1-day gap
            streak += 1
            check_date = d
            check_date = d - timedelta(days=1)
        else:
            break

    return streak


async def update_progress_after_analysis(
    athlete_id: uuid.UUID,
    analysis: Analysis,
    db: AsyncSession,
) -> None:
    """Called after a new analysis completes — updates skill_ratings and
    creates progress_events for each measured metric.

    This is designed to be called from the analysis pipeline after the AI
    response is parsed and the Analysis record is updated.
    """
    feedback = analysis.feedback_json or {}
    categories = feedback.get("categories", {})

    now = datetime.utcnow()

    # 1. Update or create SkillRating rows for each category found
    for cat_name, cat_data in categories.items():
        canonical = _map_category(cat_name)
        if canonical is None:
            continue

        score = None
        if isinstance(cat_data, dict):
            score = cat_data.get("score")
        if score is None:
            continue

        try:
            score_val = int(round(float(score)))
        except (TypeError, ValueError):
            continue
        score_val = max(1, min(10, score_val))

        # Upsert skill rating
        result = await db.execute(
            select(SkillRating).where(
                SkillRating.athlete_id == athlete_id,
                SkillRating.skill_category == canonical,
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.rating = score_val
            existing.last_updated = now
        else:
            db.add(SkillRating(
                athlete_id=athlete_id,
                skill_category=canonical,
                rating=score_val,
                last_updated=now,
            ))

    # 2. Create a ProgressEvent for the overall_score
    if analysis.overall_score is not None:
        db.add(ProgressEvent(
            athlete_id=athlete_id,
            metric_name="overall_score",
            value=float(analysis.overall_score),
            recorded_at=now,
        ))

    # 3. Create ProgressEvents for each category score
    for cat_name, cat_data in categories.items():
        canonical = _map_category(cat_name)
        if canonical is None:
            continue
        score = None
        if isinstance(cat_data, dict):
            score = cat_data.get("score")
        if score is None:
            continue
        try:
            db.add(ProgressEvent(
                athlete_id=athlete_id,
                metric_name=f"skill_{canonical}",
                value=float(score),
                recorded_at=now,
            ))
        except (TypeError, ValueError):
            continue

    await db.flush()
    logger.info(
        "Updated progress after analysis %s for athlete %s",
        analysis.id,
        athlete_id,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _map_category(cat_name: str) -> str | None:
    """Map arbitrary category names from AI feedback to canonical categories."""
    name = cat_name.lower().replace(" ", "_").replace("-", "_")
    mapping = {
        "shooting": "shooting",
        "shooting_form": "shooting",
        "dribbling": "dribbling",
        "ball_handling": "dribbling",
        "footwork": "footwork",
        "defense": "defense",
        "defence": "defense",
        "passing": "passing",
        "basketball_iq": "basketball_iq",
        "decision_making": "basketball_iq",
        "iq": "basketball_iq",
        "game_iq": "basketball_iq",
    }
    return mapping.get(name)


async def _ratings_from_table(
    athlete_id: uuid.UUID,
    db: AsyncSession,
) -> list[dict[str, Any]]:
    """Load ratings from the skill_ratings table, filling missing categories with 5."""
    result = await db.execute(
        select(SkillRating).where(SkillRating.athlete_id == athlete_id)
    )
    existing = {r.skill_category: r.rating for r in result.scalars().all()}
    return [
        {
            "skill_category": cat,
            "rating": existing.get(cat, 5),
        }
        for cat in SKILL_CATEGORIES
    ]
