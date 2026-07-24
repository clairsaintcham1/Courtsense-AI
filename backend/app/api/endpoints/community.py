"""
Community endpoints — challenges, leaderboards, badges, team joining.
"""

import uuid
from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies import get_current_athlete, get_current_user
from app.database import get_db
from app.models import (
    User,
    Athlete,
    Team,
    TeamMember,
    Challenge,
    ChallengeParticipant,
    Badge,
    AthleteBadge,
    Analysis,
)
from app.models.analysis import AnalysisStatus
from app.services.progress_service import calculate_streak

router = APIRouter(tags=["community"])

# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class ChallengeResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    skill_category: str | None
    start_date: date
    end_date: date
    rules_json: dict | None
    participant_count: int
    created_at: datetime


class ChallengeListResponse(BaseModel):
    challenges: list[ChallengeResponse]
    total: int


class JoinChallengeResponse(BaseModel):
    message: str
    participant_id: uuid.UUID


class LeaderboardEntry(BaseModel):
    rank: int
    athlete_id: uuid.UUID
    display_name: str | None
    avatar_url: str | None
    score: float
    streak: int
    analyses_count: int


class LeaderboardResponse(BaseModel):
    leaderboard: list[LeaderboardEntry]
    total: int


class AthleteBadgeResponse(BaseModel):
    id: uuid.UUID
    badge_id: uuid.UUID
    name: str
    description: str | None
    icon_url: str | None
    earned_at: datetime


class BadgeListResponse(BaseModel):
    badges: list[AthleteBadgeResponse]
    total: int


class AllBadgesResponse(BaseModel):
    badges: list[dict]


class JoinTeamRequest(BaseModel):
    invite_code: str


class JoinTeamResponse(BaseModel):
    message: str
    team_id: uuid.UUID
    team_name: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _compute_status(start: date, end: date) -> str:
    today = date.today()
    if today < start:
        return "upcoming"
    elif today > end:
        return "past"
    return "active"


async def _athlete_to_entry(
    athlete: Athlete,
    rank: int,
    db: AsyncSession,
    override_score: float | None = None,
    override_count: int | None = None,
) -> LeaderboardEntry:
    """Build a LeaderboardEntry with computed streak."""
    streak_val = await calculate_streak(athlete.id, db)

    if override_score is None:
        # Compute avg score
        score_q = await db.execute(
            select(func.avg(Analysis.overall_score)).where(
                Analysis.athlete_id == athlete.id,
                Analysis.status == AnalysisStatus.completed,
                Analysis.overall_score.isnot(None),
            )
        )
        avg = score_q.scalar()
        score_val = round(float(avg), 1) if avg else 0.0
    else:
        score_val = override_score

    if override_count is None:
        count_q = await db.execute(
            select(func.count(Analysis.id)).where(
                Analysis.athlete_id == athlete.id,
                Analysis.status == AnalysisStatus.completed,
            )
        )
        count_val = count_q.scalar() or 0
    else:
        count_val = override_count

    return LeaderboardEntry(
        rank=rank,
        athlete_id=athlete.id,
        display_name=athlete.display_name,
        avatar_url=athlete.avatar_url,
        score=score_val,
        streak=streak_val,
        analyses_count=count_val,
    )


# ---------------------------------------------------------------------------
# Challenges
# ---------------------------------------------------------------------------


@router.get("/challenges", response_model=ChallengeListResponse)
async def list_challenges(
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: str | None = Query(
        default=None, alias="status", description="Filter: active|upcoming|past"
    ),
):
    """List challenges, optionally filtered by status."""
    today = date.today()

    result = await db.execute(
        select(Challenge)
        .options(selectinload(Challenge.participants))
        .order_by(Challenge.start_date.desc())
    )
    all_challenges = result.scalars().all()

    # Filter in Python (simpler than building conditional WHERE clauses)
    filtered = []
    for c in all_challenges:
        cs = _compute_status(c.start_date, c.end_date)
        if status_filter is None or cs == status_filter:
            filtered.append(c)

    return ChallengeListResponse(
        challenges=[
            ChallengeResponse(
                id=c.id,
                name=c.name,
                description=c.description,
                skill_category=c.skill_category,
                start_date=c.start_date,
                end_date=c.end_date,
                rules_json=c.rules_json,
                participant_count=len(c.participants) if c.participants else 0,
                created_at=c.created_at,
            )
            for c in filtered
        ],
        total=len(filtered),
    )


@router.post("/challenges/{challenge_id}/join", response_model=JoinChallengeResponse)
async def join_challenge(
    challenge_id: uuid.UUID,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Athlete joins a challenge."""
    result = await db.execute(select(Challenge).where(Challenge.id == challenge_id))
    challenge = result.scalar_one_or_none()
    if challenge is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Challenge not found"
        )

    # Check if already joined
    existing = await db.execute(
        select(ChallengeParticipant).where(
            ChallengeParticipant.challenge_id == challenge_id,
            ChallengeParticipant.athlete_id == athlete.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Already joined this challenge",
        )

    participant = ChallengeParticipant(
        challenge_id=challenge_id,
        athlete_id=athlete.id,
    )
    db.add(participant)
    await db.flush()

    return JoinChallengeResponse(
        message=f"Joined '{challenge.name}' successfully!",
        participant_id=participant.id,
    )


# ---------------------------------------------------------------------------
# Leaderboard
# ---------------------------------------------------------------------------


@router.get("/leaderboard", response_model=LeaderboardResponse)
async def get_leaderboard(
    db: Annotated[AsyncSession, Depends(get_db)],
    challenge_id: uuid.UUID | None = Query(default=None),
    sort: str = Query(default="score", description="Sort: score|streak"),
    limit: int = Query(default=50, ge=1, le=100),
):
    """Global leaderboard ranked by overall score or streak.

    If challenge_id is provided, ranks only participants of that challenge
    by their challenge score.
    """
    if challenge_id:
        # Challenge-specific leaderboard: rank by challenge score
        result = await db.execute(
            select(ChallengeParticipant)
            .where(ChallengeParticipant.challenge_id == challenge_id)
            .options(selectinload(ChallengeParticipant.athlete))
            .order_by(ChallengeParticipant.score.desc().nullslast())
            .limit(limit)
        )
        participants = result.scalars().all()

        entries: list[LeaderboardEntry] = []
        for rank, cp in enumerate(participants, start=1):
            entries.append(
                await _athlete_to_entry(
                    cp.athlete,
                    rank,
                    db,
                    override_score=float(cp.score) if cp.score is not None else 0.0,
                )
            )

        return LeaderboardResponse(leaderboard=entries, total=len(entries))

    # Global leaderboard — fetch all athletes with their avg scores
    score_subq = (
        select(
            Analysis.athlete_id.label("aid"),
            func.coalesce(func.avg(Analysis.overall_score), 0).label("avg_score"),
            func.count(Analysis.id).label("analysis_count"),
        )
        .where(
            Analysis.status == AnalysisStatus.completed,
            Analysis.overall_score.isnot(None),
        )
        .group_by(Analysis.athlete_id)
        .subquery()
    )

    result = await db.execute(
        select(
            Athlete,
            func.coalesce(score_subq.c.avg_score, 0).label("score"),
            func.coalesce(score_subq.c.analysis_count, 0).label("count"),
        )
        .outerjoin(score_subq, Athlete.id == score_subq.c.aid)
        .order_by(desc("score"))
        .limit(limit)
    )
    rows = result.all()

    entries = []
    for rank, (athlete, score_val, count_val) in enumerate(rows, start=1):
        entries.append(
            await _athlete_to_entry(
                athlete, rank, db,
                override_score=float(score_val),
                override_count=int(count_val),
            )
        )

    # Re-sort by streak if requested
    if sort == "streak":
        entries.sort(key=lambda e: (e.streak, e.score), reverse=True)
        for i, e in enumerate(entries):
            e.rank = i + 1

    return LeaderboardResponse(leaderboard=entries, total=len(entries))


# ---------------------------------------------------------------------------
# Badges
# ---------------------------------------------------------------------------


@router.get("/athletes/{athlete_id}/badges", response_model=BadgeListResponse)
async def get_athlete_badges(
    athlete_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List all badges earned by an athlete."""
    result = await db.execute(
        select(AthleteBadge, Badge)
        .join(Badge, AthleteBadge.badge_id == Badge.id)
        .where(AthleteBadge.athlete_id == athlete_id)
        .order_by(AthleteBadge.earned_at.desc())
    )
    rows = result.all()

    badges = [
        AthleteBadgeResponse(
            id=ab.id,
            badge_id=ab.badge_id,
            name=b.name,
            description=b.description,
            icon_url=b.icon_url,
            earned_at=ab.earned_at,
        )
        for ab, b in rows
    ]

    return BadgeListResponse(badges=badges, total=len(badges))


@router.get("/badges", response_model=AllBadgesResponse)
async def get_all_badges(
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Return all badge definitions (for displaying locked/unlocked state)."""
    result = await db.execute(select(Badge).order_by(Badge.name))
    all_badges = result.scalars().all()
    return AllBadgesResponse(
        badges=[
            {
                "id": str(b.id),
                "name": b.name,
                "description": b.description,
                "icon_url": b.icon_url,
                "criteria_json": b.criteria_json,
            }
            for b in all_badges
        ]
    )


# ---------------------------------------------------------------------------
# Team joining & team leaderboard
# ---------------------------------------------------------------------------


@router.post("/teams/{team_id}/join", response_model=JoinTeamResponse)
async def join_team(
    team_id: uuid.UUID,
    body: JoinTeamRequest,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Athlete joins a team using its invite code."""
    result = await db.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()
    if team is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Team not found"
        )

    if team.invite_code.upper() != body.invite_code.upper():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid invite code",
        )

    # Check if already a member
    existing = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.athlete_id == athlete.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Already a member of this team",
        )

    member = TeamMember(team_id=team_id, athlete_id=athlete.id)
    db.add(member)
    await db.flush()

    # Trigger badge check (for "Team Player" badge)
    from app.services.community_service import check_and_award_badges

    await check_and_award_badges(athlete.id, db)

    return JoinTeamResponse(
        message=f"Welcome to {team.name}!",
        team_id=team.id,
        team_name=team.name,
    )


@router.get("/teams/{team_id}/leaderboard", response_model=LeaderboardResponse)
async def get_team_leaderboard(
    team_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    sort: str = Query(default="score"),
    limit: int = Query(default=50, ge=1, le=100),
):
    """Internal team leaderboard — ranks team members by avg score or streak."""
    # Verify team exists
    team_result = await db.execute(select(Team).where(Team.id == team_id))
    team = team_result.scalar_one_or_none()
    if team is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Team not found"
        )

    # Get all team member athlete IDs
    members_result = await db.execute(
        select(TeamMember).where(TeamMember.team_id == team_id)
    )
    members = members_result.scalars().all()
    athlete_ids = [m.athlete_id for m in members]

    if not athlete_ids:
        return LeaderboardResponse(leaderboard=[], total=0)

    # Build subquery for avg scores
    score_subq = (
        select(
            Analysis.athlete_id.label("aid"),
            func.coalesce(func.avg(Analysis.overall_score), 0).label("avg_score"),
            func.count(Analysis.id).label("analysis_count"),
        )
        .where(
            Analysis.athlete_id.in_(athlete_ids),
            Analysis.status == AnalysisStatus.completed,
            Analysis.overall_score.isnot(None),
        )
        .group_by(Analysis.athlete_id)
        .subquery()
    )

    result = await db.execute(
        select(
            Athlete,
            func.coalesce(score_subq.c.avg_score, 0).label("score"),
            func.coalesce(score_subq.c.analysis_count, 0).label("count"),
        )
        .join(score_subq, Athlete.id == score_subq.c.aid, isouter=True)
        .where(Athlete.id.in_(athlete_ids))
        .order_by(desc("score"))
        .limit(limit)
    )
    rows = result.all()

    entries = []
    for rank, (athlete, score_val, count_val) in enumerate(rows, start=1):
        entries.append(
            await _athlete_to_entry(
                athlete, rank, db,
                override_score=float(score_val),
                override_count=int(count_val),
            )
        )

    if sort == "streak":
        entries.sort(key=lambda e: (e.streak, e.score), reverse=True)
        for i, e in enumerate(entries):
            e.rank = i + 1

    return LeaderboardResponse(leaderboard=entries, total=len(entries))
