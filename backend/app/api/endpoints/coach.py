"""
Coach endpoints — team management, athlete oversight, workout assignment.
"""

import random
import string
import uuid
from datetime import date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies import get_current_coach, get_current_user
from app.database import get_db
from app.models import Coach, User, Team, TeamMember, Athlete, TrainingPlan, Workout, Analysis, Video

router = APIRouter(tags=["coach"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class CreateTeamRequest(BaseModel):
    name: str
    description: str | None = None


class TeamResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    invite_code: str
    member_count: int
    created_at: datetime


class InviteResponse(BaseModel):
    invite_code: str


class AthleteRosterItem(BaseModel):
    id: uuid.UUID
    display_name: str | None
    user_email: str
    skill_level: str | None
    position: str | None
    last_active: datetime | None
    latest_score: int | None


class RosterResponse(BaseModel):
    team_id: uuid.UUID
    team_name: str
    athletes: list[AthleteRosterItem]


class DrillAssignment(BaseModel):
    name: str
    category: str
    description: str | None = None
    duration_minutes: int | None = None
    sets_reps: str | None = None


class AssignWorkoutRequest(BaseModel):
    title: str
    day_of_week: int  # 0=Mon...6=Sun
    plan_week_start: date  # which week's plan this workout goes into
    drills: list[DrillAssignment] = []


class WorkoutAssignedResponse(BaseModel):
    workout_id: uuid.UUID
    plan_id: uuid.UUID
    title: str
    day_of_week: int
    drills: list[DrillAssignment]


class TeamAnalyticsResponse(BaseModel):
    team_id: uuid.UUID
    team_name: str
    athlete_count: int
    avg_completion_rate: float  # percentage of assigned workouts completed
    avg_overall_score: float | None
    attendance_trend: list[dict]  # [{week_start, completed_count, total_count}]
    athlete_breakdown: list[dict]  # [{athlete_id, name, completion_rate, avg_score}]


class RecentActivity(BaseModel):
    type: str  # "analysis", "workout_completed", "plan_assigned"
    athlete_name: str
    athlete_id: uuid.UUID
    description: str
    timestamp: datetime


class CoachDashboardResponse(BaseModel):
    team_count: int
    athlete_count: int
    total_analyses: int
    recent_activity: list[RecentActivity]
    teams: list[TeamResponse]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _generate_invite_code(length: int = 6) -> str:
    """Generate a random alphanumeric invite code."""
    chars = string.ascii_uppercase + string.digits
    return "".join(random.choices(chars, k=length))


async def _get_team_or_404(team_id: uuid.UUID, coach: Coach, db: AsyncSession) -> Team:
    """Fetch a team owned by the coach, or raise 404."""
    result = await db.execute(
        select(Team).where(Team.id == team_id, Team.coach_id == coach.id)
    )
    team = result.scalar_one_or_none()
    if team is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )
    return team


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/coach/dashboard", response_model=CoachDashboardResponse)
async def coach_dashboard(
    coach: Annotated[Coach, Depends(get_current_coach)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Return overview dashboard data for the coach."""
    # Teams
    teams_result = await db.execute(
        select(Team).where(Team.coach_id == coach.id).options(selectinload(Team.members))
    )
    teams = teams_result.scalars().all()

    team_count = len(teams)
    athlete_ids: set[uuid.UUID] = set()
    for t in teams:
        for m in t.members:
            athlete_ids.add(m.athlete_id)
    athlete_count = len(athlete_ids)

    # Total analyses across all team athletes
    total_analyses = 0
    if athlete_ids:
        count_result = await db.execute(
            select(func.count(Analysis.id)).where(
                Analysis.athlete_id.in_(athlete_ids),
                Analysis.status == "completed",
            )
        )
        total_analyses = count_result.scalar() or 0

    # Recent activity — latest 10 events (analyses completed, workouts completed)
    recent: list[RecentActivity] = []

    if athlete_ids:
        # Recent completed analyses
        analyses_result = await db.execute(
            select(Analysis, Athlete)
            .join(Athlete, Analysis.athlete_id == Athlete.id)
            .where(
                Analysis.athlete_id.in_(athlete_ids),
                Analysis.status == "completed",
            )
            .order_by(Analysis.completed_at.desc().nullslast())
            .limit(10)
        )
        for analysis, athlete in analyses_result:
            recent.append(RecentActivity(
                type="analysis",
                athlete_name=athlete.display_name or "Unknown",
                athlete_id=athlete.id,
                description=f"Scored {analysis.overall_score}" if analysis.overall_score else "Analysis completed",
                timestamp=analysis.completed_at or analysis.created_at,
            ))

        # Recent completed workouts
        workouts_result = await db.execute(
            select(Workout, TrainingPlan, Athlete)
            .join(TrainingPlan, Workout.plan_id == TrainingPlan.id)
            .join(Athlete, TrainingPlan.athlete_id == Athlete.id)
            .where(
                TrainingPlan.athlete_id.in_(athlete_ids),
                Workout.completed == True,
                Workout.completed_at.isnot(None),
            )
            .order_by(Workout.completed_at.desc())
            .limit(10)
        )
        for workout, plan, athlete in workouts_result:
            recent.append(RecentActivity(
                type="workout_completed",
                athlete_name=athlete.display_name or "Unknown",
                athlete_id=athlete.id,
                description=f"Completed: {workout.title}",
                timestamp=workout.completed_at,  # type: ignore[arg-type]
            ))

    # Sort combined activity by timestamp descending, keep top 10
    recent.sort(key=lambda a: a.timestamp, reverse=True)
    recent = recent[:10]

    # Build team responses
    team_responses = []
    for t in teams:
        team_responses.append(TeamResponse(
            id=t.id,
            name=t.name,
            description=t.description,
            invite_code=t.invite_code,
            member_count=len(t.members) if t.members else 0,
            created_at=t.created_at,
        ))

    return CoachDashboardResponse(
        team_count=team_count,
        athlete_count=athlete_count,
        total_analyses=total_analyses,
        recent_activity=recent,
        teams=team_responses,
    )


@router.post("/coach/teams", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
async def create_team(
    body: CreateTeamRequest,
    coach: Annotated[Coach, Depends(get_current_coach)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new team with an auto-generated invite code."""
    # Generate unique invite code
    for _ in range(10):
        code = _generate_invite_code()
        existing = await db.execute(select(Team).where(Team.invite_code == code))
        if existing.scalar_one_or_none() is None:
            break
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not generate unique invite code",
        )

    team = Team(
        coach_id=coach.id,
        name=body.name,
        description=body.description,
        invite_code=code,
    )
    db.add(team)
    await db.flush()

    return TeamResponse(
        id=team.id,
        name=team.name,
        description=team.description,
        invite_code=team.invite_code,
        member_count=0,
        created_at=team.created_at,
    )


@router.post("/coach/teams/{team_id}/invite", response_model=InviteResponse)
async def regenerate_invite_code(
    team_id: uuid.UUID,
    coach: Annotated[Coach, Depends(get_current_coach)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Regenerate the invite code for a team."""
    team = await _get_team_or_404(team_id, coach, db)

    for _ in range(10):
        code = _generate_invite_code()
        existing = await db.execute(select(Team).where(Team.invite_code == code))
        if existing.scalar_one_or_none() is None:
            team.invite_code = code
            break
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not generate unique invite code",
        )

    await db.flush()
    return InviteResponse(invite_code=team.invite_code)


@router.get("/coach/teams/{team_id}/athletes", response_model=RosterResponse)
async def get_team_roster(
    team_id: uuid.UUID,
    coach: Annotated[Coach, Depends(get_current_coach)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Return the roster for a team, with last-active dates and latest scores."""
    team = await _get_team_or_404(team_id, coach, db)

    # Fetch team members with their athletes and users
    members_result = await db.execute(
        select(TeamMember, Athlete, User)
        .join(Athlete, TeamMember.athlete_id == Athlete.id)
        .join(User, Athlete.user_id == User.id)
        .where(TeamMember.team_id == team_id)
        .options(selectinload(Athlete.analyses))
    )
    rows = members_result.all()

    athletes: list[AthleteRosterItem] = []
    for member, athlete, user in rows:
        # Last active: most recent analysis or workout completion
        last_active = None

        # Check most recent analysis
        latest_analysis = None
        if athlete.analyses:
            completed = [a for a in athlete.analyses if a.status == "completed"]
            if completed:
                latest = max(completed, key=lambda a: a.completed_at or a.created_at)
                latest_analysis = latest
                last_active = latest.completed_at or latest.created_at

        athletes.append(AthleteRosterItem(
            id=athlete.id,
            display_name=athlete.display_name or user.full_name,
            user_email=user.email,
            skill_level=athlete.skill_level.value if athlete.skill_level else None,
            position=athlete.position,
            last_active=last_active,
            latest_score=latest_analysis.overall_score if latest_analysis else None,
        ))

    return RosterResponse(
        team_id=team.id,
        team_name=team.name,
        athletes=athletes,
    )


@router.post("/coach/athletes/{athlete_id}/assign-workout", response_model=WorkoutAssignedResponse)
async def assign_workout(
    athlete_id: uuid.UUID,
    body: AssignWorkoutRequest,
    coach: Annotated[Coach, Depends(get_current_coach)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Assign a custom workout to an athlete on a specific day of their training plan.
    
    If the athlete doesn't have a plan for the given week, one is created automatically.
    """
    # Verify the athlete is in one of the coach's teams
    team_check = await db.execute(
        select(TeamMember)
        .join(Team, TeamMember.team_id == Team.id)
        .where(
            TeamMember.athlete_id == athlete_id,
            Team.coach_id == coach.id,
        )
    )
    if team_check.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Athlete not found in any of your teams",
        )

    # Validate day_of_week
    if body.day_of_week < 0 or body.day_of_week > 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="day_of_week must be between 0 (Monday) and 6 (Sunday)",
        )

    # Find or create training plan for the given week
    plan_result = await db.execute(
        select(TrainingPlan).where(
            TrainingPlan.athlete_id == athlete_id,
            TrainingPlan.week_start_date == body.plan_week_start,
        )
    )
    plan = plan_result.scalar_one_or_none()

    if plan is None:
        from app.models.training import PlanGenerator, PlanStatus
        plan = TrainingPlan(
            athlete_id=athlete_id,
            week_start_date=body.plan_week_start,
            status=PlanStatus.active,
            generated_by=PlanGenerator.coach,
            coach_id=coach.id,
            plan_json={"focus_areas": [], "notes": "Coach-assigned workouts"},
        )
        db.add(plan)
        await db.flush()

    # Create the workout
    drills_json = [d.model_dump() for d in body.drills] if body.drills else []
    workout = Workout(
        plan_id=plan.id,
        day_of_week=body.day_of_week,
        title=body.title,
        drills_json={"drills": drills_json} if drills_json else None,
        completed=False,
    )
    db.add(workout)
    await db.flush()

    return WorkoutAssignedResponse(
        workout_id=workout.id,
        plan_id=plan.id,
        title=workout.title,
        day_of_week=workout.day_of_week,
        drills=body.drills,
    )


@router.get("/coach/teams/{team_id}/analytics", response_model=TeamAnalyticsResponse)
async def get_team_analytics(
    team_id: uuid.UUID,
    coach: Annotated[Coach, Depends(get_current_coach)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Return aggregate analytics for a team."""
    team = await _get_team_or_404(team_id, coach, db)

    # Get all athlete IDs in the team
    members_result = await db.execute(
        select(TeamMember).where(TeamMember.team_id == team_id)
    )
    members = members_result.scalars().all()
    athlete_ids = [m.athlete_id for m in members]

    if not athlete_ids:
        return TeamAnalyticsResponse(
            team_id=team.id,
            team_name=team.name,
            athlete_count=0,
            avg_completion_rate=0.0,
            avg_overall_score=None,
            attendance_trend=[],
            athlete_breakdown=[],
        )

    # Average completion rate across all athletes
    total_workouts_result = await db.execute(
        select(func.count(Workout.id))
        .join(TrainingPlan, Workout.plan_id == TrainingPlan.id)
        .where(TrainingPlan.athlete_id.in_(athlete_ids))
    )
    total_workouts = total_workouts_result.scalar() or 0

    completed_workouts_result = await db.execute(
        select(func.count(Workout.id))
        .join(TrainingPlan, Workout.plan_id == TrainingPlan.id)
        .where(
            TrainingPlan.athlete_id.in_(athlete_ids),
            Workout.completed == True,
        )
    )
    completed_workouts = completed_workouts_result.scalar() or 0

    avg_completion_rate = (completed_workouts / total_workouts * 100) if total_workouts > 0 else 0.0

    # Average overall score
    avg_score_result = await db.execute(
        select(func.avg(Analysis.overall_score))
        .where(
            Analysis.athlete_id.in_(athlete_ids),
            Analysis.status == "completed",
            Analysis.overall_score.isnot(None),
        )
    )
    avg_score = avg_score_result.scalar()

    # Attendance trend: last 4 weeks of workout completion
    attendance_trend = []
    today = date.today()
    for week_offset in range(4):
        week_start = today - timedelta(days=today.weekday()) - timedelta(weeks=week_offset)
        week_end = week_start + timedelta(days=6)

        week_total_result = await db.execute(
            select(func.count(Workout.id))
            .join(TrainingPlan, Workout.plan_id == TrainingPlan.id)
            .where(
                TrainingPlan.athlete_id.in_(athlete_ids),
                TrainingPlan.week_start_date >= week_start,
                TrainingPlan.week_start_date <= week_end,
            )
        )
        week_total = week_total_result.scalar() or 0

        week_completed_result = await db.execute(
            select(func.count(Workout.id))
            .join(TrainingPlan, Workout.plan_id == TrainingPlan.id)
            .where(
                TrainingPlan.athlete_id.in_(athlete_ids),
                TrainingPlan.week_start_date >= week_start,
                TrainingPlan.week_start_date <= week_end,
                Workout.completed == True,
            )
        )
        week_completed = week_completed_result.scalar() or 0

        attendance_trend.append({
            "week_start": week_start.isoformat(),
            "completed_count": week_completed,
            "total_count": week_total,
        })
    attendance_trend.reverse()

    # Per-athlete breakdown
    athlete_breakdown = []
    for a_id in athlete_ids:
        # Fetch athlete name
        athlete_result = await db.execute(
            select(Athlete).where(Athlete.id == a_id).options(selectinload(Athlete.user))
        )
        athlete = athlete_result.scalar_one_or_none()
        if not athlete:
            continue

        a_total_result = await db.execute(
            select(func.count(Workout.id))
            .join(TrainingPlan, Workout.plan_id == TrainingPlan.id)
            .where(TrainingPlan.athlete_id == a_id)
        )
        a_total = a_total_result.scalar() or 0

        a_completed_result = await db.execute(
            select(func.count(Workout.id))
            .join(TrainingPlan, Workout.plan_id == TrainingPlan.id)
            .where(TrainingPlan.athlete_id == a_id, Workout.completed == True)
        )
        a_completed = a_completed_result.scalar() or 0

        a_rate = (a_completed / a_total * 100) if a_total > 0 else 0.0

        a_avg_result = await db.execute(
            select(func.avg(Analysis.overall_score))
            .where(
                Analysis.athlete_id == a_id,
                Analysis.status == "completed",
                Analysis.overall_score.isnot(None),
            )
        )
        a_avg = a_avg_result.scalar()

        athlete_breakdown.append({
            "athlete_id": str(a_id),
            "name": athlete.display_name or (athlete.user.full_name if athlete.user else "Unknown"),
            "completion_rate": round(a_rate, 1),
            "avg_score": round(a_avg, 1) if a_avg is not None else None,
        })

    return TeamAnalyticsResponse(
        team_id=team.id,
        team_name=team.name,
        athlete_count=len(athlete_ids),
        avg_completion_rate=round(avg_completion_rate, 1),
        avg_overall_score=round(avg_score, 1) if avg_score is not None else None,
        attendance_trend=attendance_trend,
        athlete_breakdown=athlete_breakdown,
    )
