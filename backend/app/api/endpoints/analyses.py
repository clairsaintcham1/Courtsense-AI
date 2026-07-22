"""
Analysis endpoints — trigger, retrieve, and list video analyses.
"""

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_athlete, get_current_user
from app.database import get_db
from app.models import Athlete, Video, Analysis, User
from app.models.analysis import AnalysisStatus, ConfidenceLevel
from app.models.video import VideoStatus

router = APIRouter(tags=["analyses"])

# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class CategoryResult(BaseModel):
    score: int | None
    observations: str
    recommended_drills: list[str]


class AnalysisFeedback(BaseModel):
    overall_score: int | None = None
    confidence: str | None = None
    summary: str | None = None
    categories: dict[str, CategoryResult] | None = None
    priority_areas: list[str] | None = None


class AnalysisResponse(BaseModel):
    id: uuid.UUID
    video_id: uuid.UUID
    athlete_id: uuid.UUID
    status: str
    overall_score: int | None
    confidence_level: str | None
    feedback_json: dict | None
    processing_time_ms: int | None
    created_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class AnalysisListResponse(BaseModel):
    analyses: list[AnalysisResponse]
    total: int
    limit: int
    offset: int


class AnalysisTriggerResponse(BaseModel):
    message: str
    analysis_id: uuid.UUID | None
    analysis_status: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _analysis_to_response(analysis: Analysis) -> AnalysisResponse:
    return AnalysisResponse(
        id=analysis.id,
        video_id=analysis.video_id,
        athlete_id=analysis.athlete_id,
        status=analysis.status.value,
        overall_score=analysis.overall_score,
        confidence_level=(
            analysis.confidence_level.value
            if analysis.confidence_level
            else None
        ),
        feedback_json=analysis.feedback_json,
        processing_time_ms=analysis.processing_time_ms,
        created_at=analysis.created_at,
        completed_at=analysis.completed_at,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/videos/{video_id}/analyze",
    response_model=AnalysisTriggerResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_analysis(
    video_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Trigger AI analysis for a video. Returns immediately — analysis runs in background.

    The client should poll GET /api/v1/videos/{video_id} to check when
    analysis completes and the video status transitions to 'ready'.
    """
    # Verify video exists and belongs to athlete
    result = await db.execute(
        select(Video).where(Video.id == video_id, Video.athlete_id == athlete.id)
    )
    video = result.scalar_one_or_none()
    if video is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video not found",
        )

    if video.status == VideoStatus.processing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Analysis is already in progress for this video",
        )

    if video.status == VideoStatus.uploading:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Video upload has not been confirmed yet",
        )

    # If the video was previously failed, allow re-analysis
    if video.status == VideoStatus.ready:
        # Check if there's already a completed analysis
        existing = await db.execute(
            select(Analysis).where(
                Analysis.video_id == video_id,
                Analysis.status == AnalysisStatus.completed,
            )
        )
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Analysis already completed for this video",
            )

    # Create a pending Analysis record
    analysis = Analysis(
        video_id=video.id,
        athlete_id=video.athlete_id,
        status=AnalysisStatus.processing,
    )
    db.add(analysis)
    video.status = VideoStatus.processing
    await db.flush()

    # Schedule background analysis
    from app.services.analysis_service import analyze_video

    async def run_analysis():
        """Background task wrapper — uses its own DB session."""
        from app.database import async_session_factory
        async with async_session_factory() as bg_db:
            try:
                await analyze_video(video_id, bg_db)
                await bg_db.commit()
            except Exception:
                await bg_db.rollback()
                # Error already logged and video.status set to 'failed' inside analyze_video

    background_tasks.add_task(run_analysis)

    return AnalysisTriggerResponse(
        message="Analysis started. Poll the video endpoint for results.",
        analysis_id=analysis.id,
        analysis_status=analysis.status.value,
    )


@router.get("/analyses/{analysis_id}", response_model=AnalysisResponse)
async def get_analysis(
    analysis_id: uuid.UUID,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Retrieve a single analysis by ID."""
    result = await db.execute(
        select(Analysis).where(
            Analysis.id == analysis_id,
            Analysis.athlete_id == athlete.id,
        )
    )
    analysis = result.scalar_one_or_none()
    if analysis is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analysis not found",
        )
    return _analysis_to_response(analysis)


@router.get("/athletes/{athlete_id}/analyses", response_model=AnalysisListResponse)
async def list_athlete_analyses(
    athlete_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    """List analyses for an athlete, newest first.

    The requesting user must be the athlete or have access (e.g., parent/coach).
    For MVP, we restrict to the athlete themselves.
    """
    # Ensure the requesting user is this athlete
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
            detail="You can only view your own analyses",
        )

    # Count
    count_q = select(func.count(Analysis.id)).where(Analysis.athlete_id == athlete_id)
    total = (await db.execute(count_q)).scalar() or 0

    # Fetch page
    result = await db.execute(
        select(Analysis)
        .where(Analysis.athlete_id == athlete_id)
        .order_by(Analysis.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    analyses = result.scalars().all()

    return AnalysisListResponse(
        analyses=[_analysis_to_response(a) for a in analyses],
        total=total,
        limit=limit,
        offset=offset,
    )
