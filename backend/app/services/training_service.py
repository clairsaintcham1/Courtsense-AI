"""
Training plan generation service — uses pgvector similarity search + GPT-4o
to create personalized 7-day workout plans targeting an athlete's weak areas.
"""

import json
import logging
import uuid
from datetime import date, datetime, timedelta
from typing import Any

from openai import AsyncOpenAI
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.analysis import Analysis, AnalysisStatus
from app.models.athlete import Athlete, SkillLevel
from app.models.training import (
    DrillCategory,
    DrillLibrary,
    PlanGenerator,
    PlanStatus,
    TrainingPlan,
    Workout,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_DAILY_DURATION_MINUTES = 45  # youth athlete cap
RAG_TOP_K = 15
RAG_THRESHOLD = 0.7  # minimum cosine similarity
EMBEDDING_MODEL = "text-embedding-3-small"
PLAN_MODEL = "gpt-4o"

# ---------------------------------------------------------------------------
# Plan-generation prompt
# ---------------------------------------------------------------------------

PLAN_GENERATION_PROMPT = """You are an expert basketball skills trainer creating a personalized 7-day workout plan
for a youth basketball athlete. Your job is to design a plan that specifically
targets their weak areas while maintaining a balanced training regimen.

## Athlete Profile
- Age group: {age_group}
- Skill level: {skill_level}
- Position: {position}
- Current skill ratings (1-10): {skill_ratings}
- Priority areas to improve: {priority_areas}
- Equipment available: {equipment}

## Important Rules (follow strictly)
1. Maximum {max_duration} minutes of training per day
2. Vary the focus across days — do NOT work on the same skill two days in a row
3. No back-to-back high-intensity days
4. **ONLY use drills from the provided drill list below** — never invent new drill names
5. Every drill must reference its exact name from the list
6. Include a rest/recovery day (Day 7, Sunday) with light stretching only
7. Each day must have: focus area, warmup drill (from list), 3-4 main drills (from list), cooldown notes
8. Mix skill work (shooting, dribbling, passing) with athletic development (footwork, conditioning, defense)

## Available Drills (ONLY use these)
{drills_list}

## Output Format
Return ONLY valid JSON matching this structure exactly. No markdown, no preamble:
{{
  "week_focus": "Brief 1-sentence summary of the week's training theme",
  "coach_note": "1-2 sentence encouraging message to the athlete",
  "days": [
    {{
      "day": 0,
      "day_name": "Monday",
      "focus": "shooting mechanics",
      "intensity": "medium",
      "warmup": {{ "drill_name": "exact drill name from list", "duration_min": 5 }},
      "main_drills": [
        {{ "drill_name": "exact drill name from list", "sets": 3, "reps": 10, "duration_min": 8, "coaching_tip": "1 sentence form tip" }}
      ],
      "cooldown": "Brief cooldown instruction (30-60 chars)"
    }}
  ],
  "total_weekly_minutes": 280
}}

IMPORTANT: The JSON must be valid and parseable. Ensure all drill names match EXACTLY
from the provided list (copy-paste the names)."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _clean_json_response(raw: str) -> str:
    """Extract JSON from a response that may contain markdown fencing."""
    import re

    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    if match:
        return match.group(1).strip()
    match = re.search(r"\{[\s\S]*\}", raw)
    if match:
        return match.group(0).strip()
    return raw.strip()


def _drill_to_text(drill: DrillLibrary) -> str:
    """Format a drill for inclusion in the prompt."""
    equipment = drill.equipment_needed
    if isinstance(equipment, list):
        equipment = ", ".join(equipment)
    elif equipment is None:
        equipment = "none"

    return (
        f"  - [{drill.category.value}] {drill.name} "
        f"(difficulty: {drill.difficulty.value}, duration: {drill.duration_minutes}min, "
        f"equipment: {equipment})\n"
        f"    Description: {drill.description}"
    )


def _format_skill_ratings(ratings: list[dict[str, Any]]) -> str:
    """Format skill ratings dicts into a readable string."""
    if not ratings:
        return "No ratings available"
    parts = []
    for r in ratings:
        cat = r.get("skill_category", r.get("category", "unknown"))
        rating_val = r.get("rating", r.get("score", "N/A"))
        parts.append(f"{cat}: {rating_val}/10")
    return ", ".join(parts)


# Category name mapping from feedback_json keys to database categories
CATEGORY_MAP = {
    "shooting_form": DrillCategory.shooting,
    "ball_handling": DrillCategory.dribbling,
    "footwork": DrillCategory.footwork,
    "defense": DrillCategory.defense,
    "passing": DrillCategory.passing,
    "decision_making": DrillCategory.iq,
}


# ---------------------------------------------------------------------------
# Main service function
# ---------------------------------------------------------------------------


async def generate_training_plan(
    athlete_id: uuid.UUID,
    focus_areas: list[str] | None,
    db: AsyncSession,
) -> TrainingPlan:
    """Generate a personalized 7-day training plan for an athlete.

    Steps:
    1. Load athlete profile + latest analysis + skill ratings + recent workouts
    2. Build query embedding from skill gaps
    3. Search drill_library via pgvector cosine similarity (top 15)
    4. Assemble GPT-4o prompt with all context
    5. GPT-4o returns structured 7-day JSON plan
    6. Store plan in training_plans + create workout rows
    7. Return the plan
    """
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    # ── 1. Load athlete data ──────────────────────────────────────────
    result = await db.execute(
        select(Athlete).where(Athlete.id == athlete_id)
    )
    athlete = result.scalar_one_or_none()
    if athlete is None:
        raise ValueError(f"Athlete {athlete_id} not found")

    # Load latest completed analysis
    result = await db.execute(
        select(Analysis)
        .where(
            Analysis.athlete_id == athlete_id,
            Analysis.status == AnalysisStatus.completed,
        )
        .order_by(Analysis.created_at.desc())
        .limit(1)
    )
    latest_analysis = result.scalar_one_or_none()

    # Load skill ratings from latest analysis or from skill_ratings table
    skill_ratings_raw: list[dict[str, Any]] = []
    if latest_analysis and latest_analysis.feedback_json:
        feedback = latest_analysis.feedback_json
        categories = feedback.get("categories", {})
        for cat_name, cat_data in categories.items():
            score = cat_data.get("score") if isinstance(cat_data, dict) else None
            if score is not None:
                skill_ratings_raw.append({
                    "skill_category": cat_name,
                    "rating": score,
                })

    # Also try the skill_ratings table
    from app.models.progress import SkillRating
    result = await db.execute(
        select(SkillRating).where(SkillRating.athlete_id == athlete_id)
    )
    db_ratings = result.scalars().all()
    # Merge: prefer analysis data, fall back to skill_ratings table
    existing_cats = {r["skill_category"] for r in skill_ratings_raw}
    for sr in db_ratings:
        if sr.skill_category not in existing_cats:
            skill_ratings_raw.append({
                "skill_category": sr.skill_category,
                "rating": sr.rating,
            })

    # Determine priority areas
    if focus_areas:
        priority_areas = focus_areas
    elif latest_analysis and latest_analysis.feedback_json:
        priority_areas = latest_analysis.feedback_json.get("priority_areas", [])
    else:
        priority_areas = ["shooting_form", "ball_handling", "footwork"]

    # Determine weakest skills (lowest rated) for embedding query
    weakest = sorted(
        skill_ratings_raw,
        key=lambda r: r.get("rating", 10) if r.get("rating") is not None else 10,
    )[:3]
    weakest_names = [w["skill_category"] for w in weakest]

    # ── 2. Build query embedding and search drill library ─────────────
    skill_level = athlete.skill_level.value if athlete.skill_level else "beginner"
    query_text = (
        f"drills for improving {', '.join(weakest_names) if weakest_names else 'basketball fundamentals'} "
        f"at {skill_level} level"
    )

    # Get embedding for query
    embedding_response = await client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=query_text,
    )
    query_embedding = embedding_response.data[0].embedding

    # Search drill_library via pgvector cosine similarity
    # Use raw SQL for pgvector operator since SQLAlchemy ORM support is limited
    embedding_str = f"[{', '.join(str(x) for x in query_embedding)}]"
    search_sql = text("""
        SELECT id, name, category, difficulty, description, duration_minutes, equipment_needed,
               1 - (embedding <=> :embedding::vector) AS similarity
        FROM drill_library
        WHERE embedding IS NOT NULL
          AND 1 - (embedding <=> :embedding::vector) > :threshold
        ORDER BY embedding <=> :embedding
        LIMIT :limit
    """)

    search_result = await db.execute(
        search_sql,
        {
            "embedding": embedding_str,
            "threshold": RAG_THRESHOLD,
            "limit": RAG_TOP_K,
        },
    )
    retrieved_drills = search_result.fetchall()

    # If no drills match threshold, fall back to loading any drills
    if not retrieved_drills:
        result = await db.execute(
            select(DrillLibrary).limit(RAG_TOP_K)
        )
        fallback_drills = result.scalars().all()
        # Reformat to match raw SQL row structure
        retrieved_drills = [
            (
                d.id, d.name, d.category.value if d.category else "shooting",
                d.difficulty.value if d.difficulty else "beginner",
                d.description, d.duration_minutes, d.equipment_needed, 0.5,
            )
            for d in fallback_drills
        ]

    # Format drills for the prompt
    drills_list_parts = []
    for row in retrieved_drills:
        drills_list_parts.append(
            f"[{row[2]}] {row[1]} (difficulty: {row[3]}, duration: {row[5]}min, "
            f"equipment: {row[6] or 'none'})\n    Description: {row[4]}"
        )
    drills_list = "\n".join(drills_list_parts)

    # ── 3. Assemble GPT-4o prompt ─────────────────────────────────────
    prompt = PLAN_GENERATION_PROMPT.format(
        age_group=athlete.age_group or "youth (8-18)",
        skill_level=skill_level,
        position=athlete.position or "all-around",
        skill_ratings=_format_skill_ratings(skill_ratings_raw),
        priority_areas=", ".join(priority_areas),
        equipment="basketball, hoop (standard equipment available)",
        max_duration=MAX_DAILY_DURATION_MINUTES,
        drills_list=drills_list,
    )

    # ── 4. Call GPT-4o ────────────────────────────────────────────────
    response = await client.chat.completions.create(
        model=PLAN_MODEL,
        messages=[
            {
                "role": "system",
                "content": "You are a professional basketball trainer. Return ONLY valid JSON.",
            },
            {"role": "user", "content": prompt},
        ],
        max_tokens=3000,
        temperature=0.4,
    )

    raw_text = response.choices[0].message.content or ""
    cleaned = _clean_json_response(raw_text)

    try:
        plan_data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.error("GPT-4o plan generation JSON parse failed: %s", str(exc))
        logger.debug("Raw response: %s", raw_text[:500])
        raise ValueError(f"Failed to parse training plan JSON: {exc}") from exc

    # Parse the structured plan JSON
    plan_json = plan_data

    # ── 5. Determine week start date (next Monday) ────────────────────
    today = date.today()
    days_until_monday = (7 - today.weekday()) % 7
    if days_until_monday == 0:
        days_until_monday = 0  # If today is Monday, use today
    week_start = today + timedelta(days=days_until_monday)

    # Check for existing plan this week
    result = await db.execute(
        select(TrainingPlan).where(
            TrainingPlan.athlete_id == athlete_id,
            TrainingPlan.week_start_date == week_start,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        # Return existing plan instead of creating duplicate
        return existing

    # ── 6. Store the plan ─────────────────────────────────────────────
    training_plan = TrainingPlan(
        athlete_id=athlete_id,
        week_start_date=week_start,
        status=PlanStatus.active,
        generated_by=PlanGenerator.ai,
        plan_json=plan_json,
    )
    db.add(training_plan)
    await db.flush()

    # Create workout rows from the plan
    days = plan_json.get("days", [])
    for day_data in days:
        day_num = day_data.get("day", 0)
        focus = day_data.get("focus", "general")
        day_name = day_data.get("day_name", f"Day {day_num + 1}")

        # Build drills_json for the workout
        workout_drills = {
            "focus": focus,
            "intensity": day_data.get("intensity", "medium"),
            "warmup": day_data.get("warmup"),
            "main_drills": day_data.get("main_drills", []),
            "cooldown": day_data.get("cooldown", ""),
        }

        # Calculate total duration
        total_min = 0
        warmup = day_data.get("warmup", {})
        if isinstance(warmup, dict):
            total_min += warmup.get("duration_min", 5)
        for drill in day_data.get("main_drills", []):
            if isinstance(drill, dict):
                total_min += drill.get("duration_min", 8)
        total_min = min(total_min, MAX_DAILY_DURATION_MINUTES)

        workout = Workout(
            plan_id=training_plan.id,
            day_of_week=day_num,
            title=f"{day_name}: {focus.title()} ({total_min}min)",
            drills_json=workout_drills,
            completed=False,
        )
        db.add(workout)

    await db.flush()

    # Eager-load workouts for return
    await db.refresh(training_plan, ["workouts"])

    logger.info(
        "Generated training plan %s for athlete %s (week of %s)",
        training_plan.id,
        athlete_id,
        week_start,
    )

    return training_plan
