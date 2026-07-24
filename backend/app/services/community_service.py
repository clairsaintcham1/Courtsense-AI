"""
Community service — badge awarding, challenge scoring, leaderboard ranking.
"""

import logging
import uuid

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Athlete,
    Badge,
    AthleteBadge,
    Analysis,
    TrainingPlan,
    Workout,
    TeamMember,
)
from app.models.analysis import AnalysisStatus
from app.services.progress_service import calculate_streak

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Badge definitions — criteria that maps to athlete stats
# ---------------------------------------------------------------------------

BADGE_DEFINITIONS = [
    {
        "name": "First Analysis",
        "description": "Complete your first video analysis",
        "icon_url": "/badges/first-analysis.svg",
        "criteria": {"type": "analysis_count", "threshold": 1},
    },
    {
        "name": "Film Junkie — Bronze",
        "description": "Complete 10 video analyses",
        "icon_url": "/badges/film-junkie-bronze.svg",
        "criteria": {"type": "analysis_count", "threshold": 10},
    },
    {
        "name": "Film Junkie — Silver",
        "description": "Complete 25 video analyses",
        "icon_url": "/badges/film-junkie-silver.svg",
        "criteria": {"type": "analysis_count", "threshold": 25},
    },
    {
        "name": "Film Junkie — Gold",
        "description": "Complete 50 video analyses",
        "icon_url": "/badges/film-junkie-gold.svg",
        "criteria": {"type": "analysis_count", "threshold": 50},
    },
    {
        "name": "Workout Warrior — Bronze",
        "description": "Complete 10 workouts",
        "icon_url": "/badges/workout-warrior-bronze.svg",
        "criteria": {"type": "workout_count", "threshold": 10},
    },
    {
        "name": "Workout Warrior — Silver",
        "description": "Complete 50 workouts",
        "icon_url": "/badges/workout-warrior-silver.svg",
        "criteria": {"type": "workout_count", "threshold": 50},
    },
    {
        "name": "Workout Warrior — Gold",
        "description": "Complete 100 workouts",
        "icon_url": "/badges/workout-warrior-gold.svg",
        "criteria": {"type": "workout_count", "threshold": 100},
    },
    {
        "name": "Streak King — Bronze",
        "description": "7-day workout streak",
        "icon_url": "/badges/streak-king-bronze.svg",
        "criteria": {"type": "streak", "threshold": 7},
    },
    {
        "name": "Streak King — Silver",
        "description": "30-day workout streak",
        "icon_url": "/badges/streak-king-silver.svg",
        "criteria": {"type": "streak", "threshold": 30},
    },
    {
        "name": "Streak King — Gold",
        "description": "90-day workout streak",
        "icon_url": "/badges/streak-king-gold.svg",
        "criteria": {"type": "streak", "threshold": 90},
    },
    {
        "name": "Sharp Shooter",
        "description": "Score 8 or above on shooting in any analysis",
        "icon_url": "/badges/sharp-shooter.svg",
        "criteria": {"type": "shooting_score", "threshold": 8},
    },
    {
        "name": "Team Player",
        "description": "Join a team",
        "icon_url": "/badges/team-player.svg",
        "criteria": {"type": "team_member", "threshold": 1},
    },
]


async def seed_badges(db: AsyncSession) -> list[Badge]:
    """Ensure all badge definitions exist in the database. Returns all badges."""
    badges: list[Badge] = []
    for bd in BADGE_DEFINITIONS:
        result = await db.execute(select(Badge).where(Badge.name == bd["name"]))
        existing = result.scalar_one_or_none()
        if existing:
            badges.append(existing)
        else:
            badge = Badge(
                name=bd["name"],
                description=bd["description"],
                icon_url=bd["icon_url"],
                criteria_json=bd["criteria"],
            )
            db.add(badge)
            badges.append(badge)
    await db.flush()
    return badges


async def check_and_award_badges(
    athlete_id: uuid.UUID, db: AsyncSession
) -> list[AthleteBadge]:
    """Check all badge criteria against athlete stats and award any newly earned ones.

    Called after significant events: analysis completed, workout completed,
    team joined, etc. Idempotent — won't duplicate already-earned badges.
    """
    # Ensure badge definitions exist
    all_badges = await seed_badges(db)
    badge_map: dict[str, Badge] = {b.name: b for b in all_badges}

    # Get already-earned badge IDs
    result = await db.execute(
        select(AthleteBadge).where(AthleteBadge.athlete_id == athlete_id)
    )
    existing_ids = {ab.badge_id for ab in result.scalars().all()}

    # ── Compute athlete stats ──────────────────────────────────────────

    # Completed analyses count
    analysis_count_q = await db.execute(
        select(func.count(Analysis.id)).where(
            Analysis.athlete_id == athlete_id,
            Analysis.status == AnalysisStatus.completed,
        )
    )
    analysis_count = analysis_count_q.scalar() or 0

    # Completed workouts count
    workout_count_q = await db.execute(
        select(func.count(Workout.id))
        .join(TrainingPlan, Workout.plan_id == TrainingPlan.id)
        .where(
            TrainingPlan.athlete_id == athlete_id,
            Workout.completed == True,
        )
    )
    workout_count = workout_count_q.scalar() or 0

    # Current streak
    streak = await calculate_streak(athlete_id, db)

    # Best shooting score from any analysis
    shooting_q = await db.execute(
        select(Analysis.feedback_json).where(
            Analysis.athlete_id == athlete_id,
            Analysis.status == AnalysisStatus.completed,
            Analysis.feedback_json.isnot(None),
        )
    )
    best_shooting = 0
    for row in shooting_q.fetchall():
        feedback = row[0] or {}
        categories = feedback.get("categories", {})
        # The shooting category may be named "shooting" or "shooting_form"
        for key in ("shooting", "shooting_form"):
            cat = categories.get(key, {})
            if isinstance(cat, dict):
                score = cat.get("score")
                if score is not None:
                    try:
                        best_shooting = max(best_shooting, int(round(float(score))))
                    except (TypeError, ValueError):
                        pass

    # Team memberships count
    team_count_q = await db.execute(
        select(func.count(TeamMember.id)).where(
            TeamMember.athlete_id == athlete_id
        )
    )
    team_count = team_count_q.scalar() or 0

    # ── Evaluate each badge ────────────────────────────────────────────

    newly_awarded: list[AthleteBadge] = []

    for bd in BADGE_DEFINITIONS:
        badge = badge_map.get(bd["name"])
        if not badge or badge.id in existing_ids:
            continue

        criteria = bd["criteria"]
        ctype = criteria["type"]
        threshold = criteria["threshold"]
        earned = False

        if ctype == "analysis_count" and analysis_count >= threshold:
            earned = True
        elif ctype == "workout_count" and workout_count >= threshold:
            earned = True
        elif ctype == "streak" and streak >= threshold:
            earned = True
        elif ctype == "shooting_score" and best_shooting >= threshold:
            earned = True
        elif ctype == "team_member" and team_count >= threshold:
            earned = True

        if earned:
            ab = AthleteBadge(athlete_id=athlete_id, badge_id=badge.id)
            db.add(ab)
            newly_awarded.append(ab)

    if newly_awarded:
        await db.flush()
        logger.info(
            "Awarded %d new badges to athlete %s", len(newly_awarded), athlete_id
        )

    return newly_awarded
