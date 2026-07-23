"""
Parent endpoints — view linked athletes' activity, weekly reports, and link new athletes.
"""

import uuid
from datetime import date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies import get_current_parent, get_current_user
from app.database import get_db
from app.models import Parent, ParentAthleteLink, Athlete, User, Analysis, TrainingPlan, Workout

router = APIRouter(tags=["parent"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class AthleteSummary(BaseModel):
    athlete_id: uuid.UUID
    display_name: str
    skill_level: str | None
    position: str | None
    latest_score: int | None
    streak: int
    recent_activity: str | None  # description of most recent event


class ParentDashboardResponse(BaseModel):
    parent_id: uuid.UUID
    linked_athletes: list[AthleteSummary]


class WeeklyReportResponse(BaseModel):
    athlete_id: uuid.UUID
    athlete_name: str
    week_start: date
    workouts_assigned: int
    workouts_completed: int
    completion_rate: float
    analyses_completed: int
    latest_score: int | None
    previous_score: int | None
    score_change: int | None  # positive = improving
    summary: str


class LinkAthleteRequest(BaseModel):
    athlete_email: str | None = None
    athlete_code: str | None = None


class LinkResponse(BaseModel):
    link_id: uuid.UUID
    athlete_id: uuid.UUID
    athlete_name: str
    message: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _compute_streak(athlete_id: uuid.UUID, db: AsyncSession) -> int:
    """Compute the athlete's current consecutive-day workout completion streak."""
    result = await db.execute(
        select(Workout)
        .join(TrainingPlan, Workout.plan_id == TrainingPlan.id)
        .where(
            TrainingPlan.athlete_id == athlete_id,
            Workout.completed == True,
            Workout.completed_at.isnot(None),
        )
        .order_by(Workout.completed_at.desc())
    )
    completed = result.scalars().all()

    if not completed:
        return 0

    streak = 0
    check_date = date.today()

    for w in completed:
        if w.completed_at is None:
            continue
        w_date = w.completed_at.date()

        if w_date == check_date:
            streak += 1
            check_date = check_date - timedelta(days=1)
        elif w_date == check_date - timedelta(days=1):
            streak += 1
            check_date = w_date - timedelta(days=1)
        else:
            break

    return streak


async def _get_athlete_if_linked(
    athlete_id: uuid.UUID, parent: Parent, db: AsyncSession
) -> Athlete:
    """Verify athlete is linked to this parent, returning the Athlete or raising 404."""
    link_result = await db.execute(
        select(ParentAthleteLink).where(
            ParentAthleteLink.parent_id == parent.id,
            ParentAthleteLink.athlete_id == athlete_id,
        )
    )
    if link_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Athlete not linked to your account",
        )

    athlete_result = await db.execute(
        select(Athlete).where(Athlete.id == athlete_id).options(selectinload(Athlete.user))
    )
    athlete = athlete_result.scalar_one_or_none()
    if athlete is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Athlete not found",
        )
    return athlete


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/parent/dashboard", response_model=ParentDashboardResponse)
async def parent_dashboard(
    parent: Annotated[Parent, Depends(get_current_parent)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Return dashboard with summaries of all linked athletes."""
    # Get all links with athletes
    links_result = await db.execute(
        select(ParentAthleteLink, Athlete, User)
        .join(Athlete, ParentAthleteLink.athlete_id == Athlete.id)
        .join(User, Athlete.user_id == User.id)
        .where(ParentAthleteLink.parent_id == parent.id)
    )
    rows = links_result.all()

    athletes: list[AthleteSummary] = []
    for link, athlete, user in rows:
        # Latest score
        latest_analysis_result = await db.execute(
            select(Analysis)
            .where(
                Analysis.athlete_id == athlete.id,
                Analysis.status == "completed",
                Analysis.overall_score.isnot(None),
            )
            .order_by(Analysis.completed_at.desc().nullslast())
            .limit(1)
        )
        latest_analysis = latest_analysis_result.scalar_one_or_none()

        # Streak
        streak = await _compute_streak(athlete.id, db)

        # Recent activity description
        recent_desc = None
        if latest_analysis:
            recent_desc = f"Latest analysis score: {latest_analysis.overall_score}"
        else:
            # Check for completed workouts
            latest_workout_result = await db.execute(
                select(Workout)
                .join(TrainingPlan, Workout.plan_id == TrainingPlan.id)
                .where(
                    TrainingPlan.athlete_id == athlete.id,
                    Workout.completed == True,
                    Workout.completed_at.isnot(None),
                )
                .order_by(Workout.completed_at.desc())
                .limit(1)
            )
            latest_workout = latest_workout_result.scalar_one_or_none()
            if latest_workout:
                recent_desc = f"Completed workout: {latest_workout.title}"

        athletes.append(AthleteSummary(
            athlete_id=athlete.id,
            display_name=athlete.display_name or user.full_name,
            skill_level=athlete.skill_level.value if athlete.skill_level else None,
            position=athlete.position,
            latest_score=latest_analysis.overall_score if latest_analysis else None,
            streak=streak,
            recent_activity=recent_desc,
        ))

    return ParentDashboardResponse(
        parent_id=parent.id,
        linked_athletes=athletes,
    )


@router.get("/parent/athletes/{athlete_id}/reports/weekly", response_model=WeeklyReportResponse)
async def weekly_report(
    athlete_id: uuid.UUID,
    parent: Annotated[Parent, Depends(get_current_parent)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Generate a weekly progress snapshot for a linked athlete."""
    athlete = await _get_athlete_if_linked(athlete_id, parent, db)

    # This week's date range (Monday to Sunday)
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    prev_week_start = week_start - timedelta(days=7)

    # This week's plan
    plan_result = await db.execute(
        select(TrainingPlan)
        .where(
            TrainingPlan.athlete_id == athlete_id,
            TrainingPlan.week_start_date == week_start,
        )
        .options(selectinload(TrainingPlan.workouts))
    )
    plan = plan_result.scalar_one_or_none()

    workouts_assigned = 0
    workouts_completed = 0
    if plan and plan.workouts:
        workouts_assigned = len(plan.workouts)
        workouts_completed = sum(1 for w in plan.workouts if w.completed)

    completion_rate = (workouts_completed / workouts_assigned * 100) if workouts_assigned > 0 else 0.0

    # Analyses this week
    analyses_this_week_result = await db.execute(
        select(func.count(Analysis.id))
        .where(
            Analysis.athlete_id == athlete_id,
            Analysis.status == "completed",
            Analysis.completed_at >= week_start,
        )
    )
    analyses_completed = analyses_this_week_result.scalar() or 0

    # Latest score (any time)
    latest_score_result = await db.execute(
        select(Analysis.overall_score)
        .where(
            Analysis.athlete_id == athlete_id,
            Analysis.status == "completed",
            Analysis.overall_score.isnot(None),
        )
        .order_by(Analysis.completed_at.desc().nullslast())
        .limit(1)
    )
    latest_score = latest_score_result.scalar()

    # Previous week's best score for comparison
    prev_score_result = await db.execute(
        select(func.max(Analysis.overall_score))
        .where(
            Analysis.athlete_id == athlete_id,
            Analysis.status == "completed",
            Analysis.overall_score.isnot(None),
            Analysis.completed_at < week_start,
            Analysis.completed_at >= prev_week_start,
        )
    )
    previous_score = prev_score_result.scalar()

    score_change = None
    if latest_score is not None and previous_score is not None:
        score_change = latest_score - previous_score

    # Generate summary
    summary_parts = []
    if workouts_completed > 0:
        summary_parts.append(f"Completed {workouts_completed} of {workouts_assigned} workouts this week")
    if analyses_completed > 0:
        summary_parts.append(f"{analyses_completed} video analysis(s) completed")
    if score_change is not None:
        direction = "up" if score_change > 0 else "down" if score_change < 0 else "steady"
        summary_parts.append(f"Score is {direction} by {abs(score_change)} points from last week")

    summary = ". ".join(summary_parts) + "." if summary_parts else "No activity this week yet."

    return WeeklyReportResponse(
        athlete_id=athlete_id,
        athlete_name=athlete.display_name or (athlete.user.full_name if athlete.user else "Unknown"),
        week_start=week_start,
        workouts_assigned=workouts_assigned,
        workouts_completed=workouts_completed,
        completion_rate=round(completion_rate, 1),
        analyses_completed=analyses_completed,
        latest_score=latest_score,
        previous_score=previous_score,
        score_change=score_change,
        summary=summary,
    )


@router.post("/parent/link", response_model=LinkResponse, status_code=status.HTTP_201_CREATED)
async def link_athlete(
    body: LinkAthleteRequest,
    parent: Annotated[Parent, Depends(get_current_parent)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Request to link an athlete to the parent account.
    
    The athlete must already exist. The parent provides either the athlete's
    email or a linking code.
    """
    if not body.athlete_email and not body.athlete_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide either athlete_email or athlete_code",
        )

    athlete = None

    if body.athlete_email:
        # Look up by email through the User table
        result = await db.execute(
            select(Athlete)
            .join(User, Athlete.user_id == User.id)
            .where(User.email == body.athlete_email)
        )
        athlete = result.scalar_one_or_none()

    if not athlete:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Athlete not found. Make sure the athlete has a CourtSense AI account.",
        )

    # Check for existing link
    existing_link = await db.execute(
        select(ParentAthleteLink).where(
            ParentAthleteLink.parent_id == parent.id,
            ParentAthleteLink.athlete_id == athlete.id,
        )
    )
    existing = existing_link.scalar_one_or_none()
    if existing:
        # Already linked — return existing info
        athlete_name = athlete.display_name or (athlete.user.full_name if athlete.user else "Athlete")
        return LinkResponse(
            link_id=existing.id,
            athlete_id=athlete.id,
            athlete_name=athlete_name,
            message=f"Already linked to {athlete_name}",
        )

    # Create the link
    link = ParentAthleteLink(
        parent_id=parent.id,
        athlete_id=athlete.id,
        relationship_type="parent",
    )
    db.add(link)
    await db.flush()

    athlete_name = athlete.display_name or "Athlete"
    if athlete.user:
        athlete_name = athlete.display_name or athlete.user.full_name

    return LinkResponse(
        link_id=link.id,
        athlete_id=athlete.id,
        athlete_name=athlete_name,
        message=f"Successfully linked to {athlete_name}",
    )
