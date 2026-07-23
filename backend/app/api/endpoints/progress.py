"""
Progress endpoints — skill ratings, progress events, and aggregate athlete stats.
"""

import uuid
from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_current_athlete
from app.database import get_db
from app.models import User, Athlete, Analysis, TrainingPlan, Workout, ProgressEvent
from app.models.analysis import AnalysisStatus
from app.services.progress_service import (
    calculate_skill_ratings,
    calculate_streak,
)

router = APIRouter(tags=["progress"])

# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class ProgressEventResponse(BaseModel):
    id: uuid.UUID
    metric_name: str
    value: float
    recorded_at: datetime


class ProgressListResponse(BaseModel):
    events: list[ProgressEventResponse]
    total: int


class SkillRatingResponse(BaseModel):
    skill_category: str
    rating: int


class SkillRatingsResponse(BaseModel):
    ratings: list[SkillRatingResponse]
    updated_at: datetime | None


class AthleteStatsResponse(BaseModel):
    total_workouts: int
    current_streak: int
    analyses_count: int
    hours_trained: float
    average_score: float | None
    total_videos: int


# ---------------------------------------------------------------------------
# Auth helper — verify the requester has access to this athlete
# ---------------------------------------------------------------------------


async def _verify_athlete_access(
    athlete_id: uuid.UUID,
    current_user: User,
    db: AsyncSession,
) -> Athlete:
    """Return the Athlete if current_user is that athlete. MVP: athlete-only access."""
    result = await db.execute(
        select(Athlete).where(
            Athlete.id == athlete_id,
            Athlete.user_id == current_user.id,
        )
    )
    athlete = result.scalar_one_or_none()
    if athlete is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only access your own progress data",
        )
    return athlete


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/athletes/{athlete_id}/progress", response_model=ProgressListResponse)
async def get_athlete_progress(
    athlete_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    metric: str | None = Query(default=None, description="Filter by metric name"),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    limit: int = Query(default=100, ge=1, le=500),
):
    """Return time-series progress events for an athlete.

    Optional query params filter by metric_name and date range.
    """
    await _verify_athlete_access(athlete_id, current_user, db)

    conditions = [ProgressEvent.athlete_id == athlete_id]
    if metric:
        conditions.append(ProgressEvent.metric_name == metric)
    if from_date:
        conditions.append(ProgressEvent.recorded_at >= from_date)
    if to_date:
        conditions.append(ProgressEvent.recorded_at <= to_date)

    # Count
    count_q = select(func.count(ProgressEvent.id)).where(*conditions)
    total = (await db.execute(count_q)).scalar() or 0

    # Fetch
    result = await db.execute(
        select(ProgressEvent)
        .where(*conditions)
        .order_by(ProgressEvent.recorded_at.desc())
        .limit(limit)
    )
    events = result.scalars().all()

    return ProgressListResponse(
        events=[
            ProgressEventResponse(
                id=e.id,
                metric_name=e.metric_name,
                value=e.value,
                recorded_at=e.recorded_at,
            )
            for e in events
        ],
        total=total,
    )


@router.get("/athletes/{athlete_id}/skill-ratings", response_model=SkillRatingsResponse)
async def get_skill_ratings(
    athlete_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Return the 6-category skill ratings for an athlete.

    Computed from analysis history with recency-weighted averaging.
    """
    await _verify_athlete_access(athlete_id, current_user, db)

    ratings = await calculate_skill_ratings(athlete_id, db)

    # Find most recent update time
    from app.models.progress import SkillRating
    result = await db.execute(
        select(func.max(SkillRating.last_updated)).where(
            SkillRating.athlete_id == athlete_id
        )
    )
    updated_at = result.scalar()

    return SkillRatingsResponse(
        ratings=[
            SkillRatingResponse(skill_category=r["skill_category"], rating=r["rating"])
            for r in ratings
        ],
        updated_at=updated_at,
    )


@router.get("/athletes/{athlete_id}/stats", response_model=AthleteStatsResponse)
async def get_athlete_stats(
    athlete_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Return aggregate stats for an athlete's dashboard."""
    await _verify_athlete_access(athlete_id, current_user, db)

    # Total completed workouts
    workout_count_q = select(func.count(Workout.id)).where(
        Workout.plan_id.in_(
            select(TrainingPlan.id).where(TrainingPlan.athlete_id == athlete_id)
        ),
        Workout.completed == True,
    )
    total_workouts = (await db.execute(workout_count_q)).scalar() or 0

    # Current streak
    current_streak = await calculate_streak(athlete_id, db)

    # Total completed analyses
    analyses_count_q = select(func.count(Analysis.id)).where(
        Analysis.athlete_id == athlete_id,
        Analysis.status == AnalysisStatus.completed,
    )
    analyses_count = (await db.execute(analyses_count_q)).scalar() or 0

    # Hours trained — sum estimated workout durations
    # Each completed workout has drills_json with estimated minutes
    hours_q = await db.execute(
        select(Workout.drills_json)
        .where(
            Workout.plan_id.in_(
                select(TrainingPlan.id).where(TrainingPlan.athlete_id == athlete_id)
            ),
            Workout.completed == True,
            Workout.drills_json.isnot(None),
        )
    )
    total_minutes = 0.0
    for row in hours_q.fetchall():
        drills = row[0] or {}
        warmup = drills.get("warmup", {})
        if isinstance(warmup, dict):
            total_minutes += warmup.get("duration_min", 5)
        for drill in drills.get("main_drills", []):
            if isinstance(drill, dict):
                total_minutes += drill.get("duration_min", 8)
        # Cap per workout at 45 min to avoid overcounting
        # (already enforced by training service, but safety measure)
        # We'll just use the raw estimate

    hours_trained = round(total_minutes / 60.0, 1)

    # Average overall score from completed analyses
    avg_score_q = await db.execute(
        select(func.avg(Analysis.overall_score)).where(
            Analysis.athlete_id == athlete_id,
            Analysis.status == AnalysisStatus.completed,
            Analysis.overall_score.isnot(None),
        )
    )
    avg_score = avg_score_q.scalar()
    average_score = round(float(avg_score), 1) if avg_score is not None else None

    # Total videos uploaded
    from app.models.video import Video
    total_videos_q = select(func.count(Video.id)).where(
        Video.athlete_id == athlete_id,
    )
    total_videos = (await db.execute(total_videos_q)).scalar() or 0

    return AthleteStatsResponse(
        total_workouts=total_workouts,
        current_streak=current_streak,
        analyses_count=analyses_count,
        hours_trained=hours_trained,
        average_score=average_score,
        total_videos=total_videos,
    )
