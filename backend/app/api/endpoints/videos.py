"""
Video endpoints — upload, list, retrieve.
"""

import asyncio
import uuid
from datetime import datetime
from typing import Annotated

import boto3
from botocore.config import Config as BotoConfig
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies import get_current_athlete
from app.config import settings
from app.database import get_db, async_session_factory
from app.models import Athlete, Video, Analysis
from app.models.analysis import AnalysisStatus
from app.models.video import VideoStatus

router = APIRouter(prefix="/videos", tags=["videos"])

# ---------------------------------------------------------------------------
# S3 client (lazy — created once on first use)
# ---------------------------------------------------------------------------

_s3_client = None


def _get_s3_client():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            region_name=settings.AWS_REGION,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            config=BotoConfig(signature_version="s3v4"),
        )
    return _s3_client


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class UploadUrlRequest(BaseModel):
    filename: str
    content_type: str = Field(default="video/mp4")


class UploadUrlResponse(BaseModel):
    upload_url: str
    s3_key: str
    video_id: uuid.UUID


class ConfirmUploadRequest(BaseModel):
    s3_key: str
    duration_seconds: int | None = None
    file_size_bytes: int | None = None


class VideoResponse(BaseModel):
    id: uuid.UUID
    athlete_id: uuid.UUID
    s3_key: str
    thumbnail_url: str | None
    duration_seconds: int | None
    file_size_bytes: int | None
    status: str
    error_message: str | None
    uploaded_at: datetime
    processed_at: datetime | None

    model_config = {"from_attributes": True}


class VideoListResponse(BaseModel):
    videos: list[VideoResponse]
    total: int
    limit: int
    offset: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _video_to_response(video: Video) -> VideoResponse:
    return VideoResponse(
        id=video.id,
        athlete_id=video.athlete_id,
        s3_key=video.s3_key,
        thumbnail_url=video.thumbnail_url,
        duration_seconds=video.duration_seconds,
        file_size_bytes=video.file_size_bytes,
        status=video.status.value,
        error_message=video.error_message,
        uploaded_at=video.uploaded_at,
        processed_at=video.processed_at,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/upload-url", response_model=UploadUrlResponse)
async def create_upload_url(
    body: UploadUrlRequest,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Generate a presigned S3 PUT URL for direct browser upload.

    Creates a Video record in 'uploading' status and returns the upload URL
    together with the S3 key and video ID the client needs to confirm later.
    """
    # Sanitise filename — keep only the last segment
    safe_name = body.filename.split("/")[-1]
    if not safe_name:
        safe_name = "video.mp4"

    video_id = uuid.uuid4()
    s3_key = f"videos/{athlete.id}/{video_id}_{safe_name}"

    # Create presigned PUT URL (5-minute expiry)
    s3 = _get_s3_client()
    try:
        upload_url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.S3_BUCKET,
                "Key": s3_key,
                "ContentType": body.content_type,
            },
            ExpiresIn=300,  # 5 minutes
            HttpMethod="PUT",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to generate presigned URL: {exc}",
        )

    # Create Video record
    video = Video(
        id=video_id,
        athlete_id=athlete.id,
        s3_key=s3_key,
        status=VideoStatus.uploading,
    )
    db.add(video)
    await db.flush()

    return UploadUrlResponse(
        upload_url=upload_url,
        s3_key=s3_key,
        video_id=video_id,
    )


@router.post("", response_model=VideoResponse, status_code=status.HTTP_200_OK)
async def confirm_upload(
    body: ConfirmUploadRequest,
    background_tasks: BackgroundTasks,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Confirm that a video has been uploaded to S3 and trigger processing.

    The client calls this after the direct-to-S3 PUT completes.  We verify the
    S3 key belongs to the athlete, update status to 'processing', launch the
    AI analysis in the background, and return the updated video record.
    """
    # Find the video by s3_key, scoped to this athlete
    result = await db.execute(
        select(Video).where(
            Video.s3_key == body.s3_key,
            Video.athlete_id == athlete.id,
        )
    )
    video = result.scalar_one_or_none()
    if video is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video not found with that s3_key",
        )

    if video.status != VideoStatus.uploading:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Video is already in '{video.status.value}' status",
        )

    # Update fields
    video.status = VideoStatus.processing
    if body.duration_seconds is not None:
        video.duration_seconds = body.duration_seconds
    if body.file_size_bytes is not None:
        video.file_size_bytes = body.file_size_bytes

    # Create a pending Analysis record so the frontend sees it's processing
    analysis = Analysis(
        video_id=video.id,
        athlete_id=video.athlete_id,
        status=AnalysisStatus.processing,
    )
    db.add(analysis)
    await db.flush()

    # ── Launch AI analysis in the background (asyncio.create_task for MVP) ──
    from app.services.analysis_service import analyze_video

    async def run_analysis():
        """Background analysis with its own DB session."""
        async with async_session_factory() as bg_db:
            try:
                await analyze_video(video.id, bg_db)
                await bg_db.commit()
            except Exception:
                await bg_db.rollback()
                # Error is already handled inside analyze_video

    background_tasks.add_task(run_analysis)

    return _video_to_response(video)


@router.get("", response_model=VideoListResponse)
async def list_videos(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    """List the current athlete's videos, newest first."""
    # Count total
    count_q = select(func.count(Video.id)).where(Video.athlete_id == athlete.id)
    total = (await db.execute(count_q)).scalar() or 0

    # Fetch page
    result = await db.execute(
        select(Video)
        .where(Video.athlete_id == athlete.id)
        .order_by(Video.uploaded_at.desc())
        .limit(limit)
        .offset(offset)
    )
    videos = result.scalars().all()

    return VideoListResponse(
        videos=[_video_to_response(v) for v in videos],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{video_id}", response_model=dict)
async def get_video(
    video_id: uuid.UUID,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get a single video with its analysis if available."""
    result = await db.execute(
        select(Video)
        .where(Video.id == video_id, Video.athlete_id == athlete.id)
        .options(selectinload(Video.analysis))
    )
    video = result.scalar_one_or_none()
    if video is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video not found",
        )

    response = {
        "video": _video_to_response(video).model_dump(),
        "analysis": None,
    }

    if video.analysis is not None:
        response["analysis"] = {
            "id": str(video.analysis.id),
            "status": video.analysis.status.value,
            "overall_score": video.analysis.overall_score,
            "confidence_level": (
                video.analysis.confidence_level.value
                if video.analysis.confidence_level
                else None
            ),
            "feedback_json": video.analysis.feedback_json,
            "processing_time_ms": video.analysis.processing_time_ms,
            "created_at": video.analysis.created_at.isoformat(),
            "completed_at": (
                video.analysis.completed_at.isoformat()
                if video.analysis.completed_at
                else None
            ),
        }

    return response
