"""
Seed data — community challenges.

These are inserted idempotently (by name + start_date), so it's safe to
run on every startup or call from a management script.
"""

import logging
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.community import Challenge

logger = logging.getLogger(__name__)

# Helper: first day of current month
_today = date.today()
_month_start = _today.replace(day=1)
_month_end = (_month_start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
_week_start = _today - timedelta(days=_today.weekday())  # Monday
_week_end = _week_start + timedelta(days=6)  # Sunday

SEED_CHALLENGES = [
    {
        "name": "Free Throw Challenge",
        "description": (
            "Upload the most free throw analysis videos this month. "
            "Every video counts — the athlete with the most analyses wins!"
        ),
        "skill_category": "shooting",
        "start_date": _month_start,
        "end_date": _month_end,
        "rules_json": {"metric": "analysis_count", "win_condition": "most_analyses"},
    },
    {
        "name": "Workout Streak",
        "description": (
            "Build the longest workout streak this week. Complete at least one "
            "workout every day to climb the leaderboard."
        ),
        "skill_category": None,
        "start_date": _week_start,
        "end_date": _week_end,
        "rules_json": {"metric": "streak", "win_condition": "longest_streak"},
    },
    {
        "name": "Form Master",
        "description": (
            "Achieve the highest overall analysis score this week. Focus on "
            "perfecting your form across all skill categories."
        ),
        "skill_category": None,
        "start_date": _week_start,
        "end_date": _week_end,
        "rules_json": {"metric": "overall_score", "win_condition": "highest_score"},
    },
    {
        "name": "Sharpshooter Showdown",
        "description": (
            "Score the highest shooting rating on any single analysis this month. "
            "One perfect shot analysis could win it all!"
        ),
        "skill_category": "shooting",
        "start_date": _month_start,
        "end_date": _month_end,
        "rules_json": {
            "metric": "shooting_score",
            "win_condition": "highest_single_score",
        },
    },
    {
        "name": "Rising Star",
        "description": (
            "New to CourtSense this month? The highest overall score from a "
            "newcomer takes the crown."
        ),
        "skill_category": None,
        "start_date": _month_start,
        "end_date": _month_end,
        "rules_json": {
            "metric": "overall_score",
            "win_condition": "highest_score",
            "filter": "new_athletes",
        },
    },
]


async def seed_challenges(db: AsyncSession) -> list[Challenge]:
    """Insert seed challenges if they don't already exist (by name + start_date).

    Safe to call repeatedly — skips existing challenges.
    """
    created: list[Challenge] = []
    for cd in SEED_CHALLENGES:
        existing = await db.execute(
            select(Challenge).where(
                Challenge.name == cd["name"],
                Challenge.start_date == cd["start_date"],
            )
        )
        if existing.scalar_one_or_none() is None:
            challenge = Challenge(
                name=cd["name"],
                description=cd["description"],
                skill_category=cd["skill_category"],
                start_date=cd["start_date"],
                end_date=cd["end_date"],
                rules_json=cd["rules_json"],
            )
            db.add(challenge)
            created.append(challenge)
            logger.info("Seeded challenge: %s", cd["name"])

    if created:
        await db.flush()

    return created
