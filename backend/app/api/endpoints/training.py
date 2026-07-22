"""
Training plan endpoints — generate, list, retrieve plans and manage workouts.
"""

import uuid
from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies import get_current_athlete, get_current_user
from app.database import get_db
from app.models import Athlete, User, TrainingPlan, Workout
from app.models.training import PlanStatus

router = APIRouter(tags=["training"])

# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class GeneratePlanRequest(BaseModel):
    focus_areas: list[str] | None = None


class WorkoutResponse(BaseModel):
    id: uuid.UUID
    day_of_week: int
    title: str
    drills_json: dict | None
    completed: bool
    completed_at: datetime | None
    athlete_notes: str | None


class TrainingPlanResponse(BaseModel):
    id: uuid.UUID
    athlete_id: uuid.UUID
    week_start_date: date
    status: str
    generated_by: str
    plan_json: dict | None
    created_at: datetime
    workouts: list[WorkoutResponse] = []


class PlanListResponse(BaseModel):
    plans: list[TrainingPlanResponse]
    total: int


class CompleteWorkoutResponse(BaseModel):
    id: uuid.UUID
    completed: bool
    completed_at: datetime | None
    streak: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _plan_to_response(plan: TrainingPlan) -> TrainingPlanResponse:
    workouts = []
    if plan.workouts:
        workouts = [
            WorkoutResponse(
                id=w.id,
                day_of_week=w.day_of_week,
                title=w.title,
                drills_json=w.drills_json,
                completed=w.completed,
                completed_at=w.completed_at,
                athlete_notes=w.athlete_notes,
            )
            for w in sorted(plan.workouts, key=lambda w: w.day_of_week)
        ]

    return TrainingPlanResponse(
        id=plan.id,
        athlete_id=plan.athlete_id,
        week_start_date=plan.week_start_date,
        status=plan.status.value if hasattr(plan.status, "value") else plan.status,
        generated_by=plan.generated_by.value if hasattr(plan.generated_by, "value") else plan.generated_by,
        plan_json=plan.plan_json,
        created_at=plan.created_at,
        workouts=workouts,
    )


async def _compute_streak(athlete_id: uuid.UUID, db: AsyncSession) -> int:
    """Compute the athlete's current consecutive-day workout completion streak."""
    # Get all completed workouts for this athlete, ordered by date desc
    result = await db.execute(
        select(Workout)
        .join(TrainingPlan, Workout.plan_id == TrainingPlan.id)
        .where(
            TrainingPlan.athlete_id == athlete_id,
            Workout.completed == True,
        )
        .order_by(Workout.completed_at.desc())
    )
    completed_workouts = result.scalars().all()

    if not completed_workouts:
        return 0

    streak = 0
    check_date = date.today()

    for w in completed_workouts:
        if w.completed_at is None:
            continue
        w_date = w.completed_at.date()

        if w_date == check_date:
            streak += 1
            check_date = check_date.replace(day=check_date.day - 1)
        elif w_date == check_date - timedelta(days=1):
            # Allow 1-day gap
            streak += 1
            check_date = w_date - timedelta(days=1)
        else:
            break

    return streak


from datetime import timedelta  # used in _compute_streak


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/training-plans/generate",
    response_model=TrainingPlanResponse,
    status_code=status.HTTP_201_CREATED,
)
async def generate_plan(
    body: GeneratePlanRequest | None = None,
    athlete: Annotated[Athlete, Depends(get_current_athlete)] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
):
    """Generate a personalized 7-day training plan for the current athlete.

    Uses the athlete's latest video analysis, skill ratings, and RAG-powered
    drill library search to create a plan targeting weak areas.
    """
    from app.services.training_service import generate_training_plan

    try:
        plan = await generate_training_plan(
            athlete_id=athlete.id,
            focus_areas=body.focus_areas if body else None,
            db=db,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    # Reload with eager-loaded workouts
    result = await db.execute(
        select(TrainingPlan)
        .where(TrainingPlan.id == plan.id)
        .options(selectinload(TrainingPlan.workouts))
    )
    plan = result.scalar_one()

    return _plan_to_response(plan)


@router.get("/training-plans", response_model=PlanListResponse)
async def list_plans(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=10, ge=1, le=50),
):
    """List the current athlete's training plans, newest first."""
    # Count
    count_q = select(func.count(TrainingPlan.id)).where(
        TrainingPlan.athlete_id == athlete.id
    )
    total = (await db.execute(count_q)).scalar() or 0

    # Fetch
    result = await db.execute(
        select(TrainingPlan)
        .where(TrainingPlan.athlete_id == athlete.id)
        .options(selectinload(TrainingPlan.workouts))
        .order_by(TrainingPlan.created_at.desc())
        .limit(limit)
    )
    plans = result.scalars().all()

    return PlanListResponse(
        plans=[_plan_to_response(p) for p in plans],
        total=total,
    )


@router.get("/training-plans/{plan_id}", response_model=TrainingPlanResponse)
async def get_plan(
    plan_id: uuid.UUID,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get a specific training plan with its workouts."""
    result = await db.execute(
        select(TrainingPlan)
        .where(
            TrainingPlan.id == plan_id,
            TrainingPlan.athlete_id == athlete.id,
        )
        .options(selectinload(TrainingPlan.workouts))
    )
    plan = result.scalar_one_or_none()
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Training plan not found",
        )

    return _plan_to_response(plan)


@router.patch("/workouts/{workout_id}/complete", response_model=CompleteWorkoutResponse)
async def complete_workout(
    workout_id: uuid.UUID,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Mark a workout as completed and return updated streak."""
    # Verify the workout belongs to this athlete's plan
    result = await db.execute(
        select(Workout)
        .join(TrainingPlan, Workout.plan_id == TrainingPlan.id)
        .where(
            Workout.id == workout_id,
            TrainingPlan.athlete_id == athlete.id,
        )
    )
    workout = result.scalar_one_or_none()
    if workout is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workout not found",
        )

    # Toggle completion
    if workout.completed:
        workout.completed = False
        workout.completed_at = None
    else:
        workout.completed = True
        workout.completed_at = datetime.utcnow()

    await db.flush()

    # Compute streak
    streak = await _compute_streak(athlete.id, db)

    return CompleteWorkoutResponse(
        id=workout.id,
        completed=workout.completed,
        completed_at=workout.completed_at,
        streak=streak,
    )
