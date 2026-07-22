"""
Video analysis service — extracts frames, sends to GPT-4o Vision,
parses structured coaching feedback, and stores results.
"""

import base64
import io
import json
import logging
import re
import tempfile
import time
import uuid
from typing import Any

import boto3
import cv2
import numpy as np
from botocore.config import Config as BotoConfig
from openai import AsyncOpenAI
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.analysis import Analysis, AnalysisStatus, ConfidenceLevel
from app.models.video import Video, VideoStatus

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

FRAME_INTERVAL_SECONDS = 2       # extract one frame every N seconds
MAX_FRAMES = 20                  # cap total frames sent to GPT-4o
FRAME_MAX_DIMENSION = 512        # resize longest edge
JPEG_QUALITY = 80

MAX_RETRIES = 3
INITIAL_TEMPERATURE = 0.2

# ---------------------------------------------------------------------------
# S3 client (lazy singleton)
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
# Pydantic schemas for GPT-4o response validation
# ---------------------------------------------------------------------------


class CategoryFeedback(BaseModel):
    score: int | None = None
    observations: str = ""
    recommended_drills: list[str] = Field(default_factory=list)


class AnalysisResponse(BaseModel):
    overall_score: int
    confidence: ConfidenceLevel
    summary: str
    categories: dict[str, CategoryFeedback]
    priority_areas: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Prompt template (exact text from architecture spec)
# ---------------------------------------------------------------------------

ANALYSIS_PROMPT = """You are an expert basketball skills analyst evaluating youth/amateur athletes.
Analyze these key frames from a training video, extracted at 2-second intervals.
Assess the following 6 skill categories. For each, provide:
- score (integer 1-10)
- observations (1-2 specific, actionable notes — reference what you actually see in the frames)
- recommended_drills (array of 1-2 drill names from a standard basketball drill catalog)

Also provide:
- overall_score (integer 1-100, weighted average across assessed categories)
- confidence (one of: "low", "medium", "high" — based on frame quality, angle, completeness)
- summary (2-3 sentence overall assessment for the athlete)
- priority_areas (top 2-3 categories needing most work, by category name)

Categories to assess:
1. shooting_form — release, elbow alignment, follow-through, balance
2. ball_handling — dribble control, hand positioning, pace, off-hand usage
3. footwork — pivot technique, stance, lateral movement, jump mechanics
4. defense — stance width, slide technique, hand activity, positioning
5. passing — accuracy, decision-making, pass type selection, timing
6. decision_making — shot selection, court awareness, reading defenders

If you cannot assess a category (e.g., no relevant frames in this clip), set score to null
and note "insufficient footage" in observations. Never fabricate analysis.

Respond ONLY with valid JSON — no markdown, no preamble. Use this exact structure:
{
  "overall_score": 75,
  "confidence": "medium",
  "summary": "Brief assessment here...",
  "categories": {
    "shooting_form": { "score": 7, "observations": "...", "recommended_drills": ["Drill 1", "Drill 2"] },
    "ball_handling": { "score": 6, "observations": "...", "recommended_drills": ["Drill A"] },
    "footwork": { "score": null, "observations": "insufficient footage", "recommended_drills": [] },
    "defense": { "score": 5, "observations": "...", "recommended_drills": ["Drill X"] },
    "passing": { "score": 8, "observations": "...", "recommended_drills": ["Drill Y"] },
    "decision_making": { "score": 6, "observations": "...", "recommended_drills": ["Drill Z"] }
  },
  "priority_areas": ["defense", "ball_handling"]
}"""

# ---------------------------------------------------------------------------
# Frame extraction
# ---------------------------------------------------------------------------


def _resize_frame(frame: np.ndarray, max_dim: int = FRAME_MAX_DIMENSION) -> np.ndarray:
    """Resize frame so its longest edge does not exceed max_dim, preserving aspect ratio."""
    h, w = frame.shape[:2]
    if max(h, w) <= max_dim:
        return frame
    scale = max_dim / max(h, w)
    new_w, new_h = int(w * scale), int(h * scale)
    return cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)


def _frame_to_base64(frame: np.ndarray) -> str:
    """Encode an OpenCV frame (BGR) as a base64 JPEG string."""
    _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    return base64.b64encode(buffer).decode("utf-8")


def extract_frames_from_bytes(video_bytes: bytes) -> list[str]:
    """Extract key frames from video bytes and return list of base64 JPEG strings.

    Samples 1 frame every FRAME_INTERVAL_SECONDS, capped at MAX_FRAMES.
    Each frame is resized to FRAME_MAX_DIMENSION on its longest edge.
    """
    # Write bytes to a temp file — OpenCV's VideoCapture needs a file path
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp.write(video_bytes)
        tmp_path = tmp.name

    try:
        cap = cv2.VideoCapture(tmp_path)
        if not cap.isOpened():
            raise RuntimeError("OpenCV could not open video file")

        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        # If fps is 0 or unreadable, fall back to a safe default
        if fps <= 0:
            fps = 30.0

        duration_sec = total_frames / fps if fps > 0 else 0
        frame_skip = max(1, int(fps * FRAME_INTERVAL_SECONDS))

        frames_b64: list[str] = []
        frame_idx = 0

        while len(frames_b64) < MAX_FRAMES:
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
            ret, frame = cap.read()
            if not ret:
                break

            resized = _resize_frame(frame)
            frames_b64.append(_frame_to_base64(resized))
            frame_idx += frame_skip

        cap.release()
        logger.info(
            "Extracted %d frames from video (%.1fs, %d total frames, fps=%.1f)",
            len(frames_b64),
            duration_sec,
            total_frames,
            fps,
        )
        return frames_b64

    finally:
        # Clean up temp file
        import os
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# GPT-4o Vision call
# ---------------------------------------------------------------------------


def _build_messages(frames_b64: list[str], retry_count: int) -> list[dict[str, Any]]:
    """Build the OpenAI chat completion messages array.

    On retries we append a reminder to output ONLY valid JSON.
    """
    prompt = ANALYSIS_PROMPT
    if retry_count > 0:
        prompt += (
            f"\n\nIMPORTANT (attempt {retry_count + 1}): Your previous response was not "
            "valid JSON. Respond ONLY with valid JSON this time — no markdown, "
            "no backticks, no preamble, no explanation."
        )

    content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    for b64 in frames_b64:
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{b64}", "detail": "low"},
        })

    return [{"role": "user", "content": content}]


def _clean_json_response(raw: str) -> str:
    """Attempt to extract JSON from a response that may contain markdown fencing."""
    # Try to find JSON between ```json ... ``` fences
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    if match:
        return match.group(1).strip()
    # Try to find the first { ... } block
    match = re.search(r"\{[\s\S]*\}", raw)
    if match:
        return match.group(0).strip()
    return raw.strip()


async def _call_gpt4o_vision(
    frames_b64: list[str], retry_count: int = 0
) -> AnalysisResponse:
    """Send frames to GPT-4o Vision and return a validated AnalysisResponse.

    If the response isn't valid JSON, this raises ValueError so the caller
    can retry with higher temperature.
    """
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    temperature = INITIAL_TEMPERATURE + (retry_count * 0.2)

    messages = _build_messages(frames_b64, retry_count)

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        max_tokens=2000,
        temperature=temperature,
    )

    raw_text = response.choices[0].message.content or ""

    # Clean and parse
    cleaned = _clean_json_response(raw_text)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.warning("GPT-4o JSON parse failed (attempt %d): %s", retry_count + 1, str(exc))
        raise ValueError(f"Invalid JSON from GPT-4o: {exc}") from exc

    # Validate with Pydantic
    try:
        return AnalysisResponse(**data)
    except ValidationError as exc:
        logger.warning("GPT-4o response validation failed (attempt %d): %s", retry_count + 1, str(exc))
        raise ValueError(f"Response schema validation failed: {exc}") from exc


# ---------------------------------------------------------------------------
# Main analysis function
# ---------------------------------------------------------------------------


async def analyze_video(
    video_id: uuid.UUID,
    db: AsyncSession,
) -> Analysis:
    """Run the full video analysis pipeline.

    1. Load the Video record
    2. Download video bytes from S3
    3. Extract key frames with OpenCV
    4. Send frames to GPT-4o Vision (with retry logic)
    5. Store the Analysis record
    6. Update Video status

    Returns the Analysis record. Raises on unrecoverable failure.
    """
    start_time = time.monotonic()

    # ── 1. Load Video ──────────────────────────────────────────────────
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()
    if video is None:
        raise ValueError(f"Video {video_id} not found")

    # ── 2. Download from S3 ───────────────────────────────────────────
    s3 = _get_s3_client()
    try:
        s3_response = s3.get_object(Bucket=settings.S3_BUCKET, Key=video.s3_key)
        video_bytes = s3_response["Body"].read()
    except Exception as exc:
        video.status = VideoStatus.failed
        video.error_message = f"S3 download failed: {exc}"
        await db.flush()
        raise RuntimeError(f"Failed to download video from S3: {exc}") from exc

    # ── 3. Extract frames ─────────────────────────────────────────────
    try:
        frames_b64 = extract_frames_from_bytes(video_bytes)
    except Exception as exc:
        video.status = VideoStatus.failed
        video.error_message = f"Frame extraction failed: {exc}"
        await db.flush()
        raise RuntimeError(f"Failed to extract frames: {exc}") from exc

    if not frames_b64:
        video.status = VideoStatus.failed
        video.error_message = "No frames could be extracted from the video"
        await db.flush()
        raise RuntimeError("No frames extracted from video")

    # ── 4. Call GPT-4o Vision with retry logic ────────────────────────
    last_error = None
    parsed: AnalysisResponse | None = None

    for attempt in range(MAX_RETRIES):
        try:
            parsed = await _call_gpt4o_vision(frames_b64, retry_count=attempt)
            break
        except (ValueError, Exception) as exc:
            last_error = str(exc)
            logger.warning(
                "Analysis attempt %d/%d failed for video %s: %s",
                attempt + 1,
                MAX_RETRIES,
                video_id,
                last_error,
            )
            if attempt < MAX_RETRIES - 1:
                continue
            # All retries exhausted
            video.status = VideoStatus.failed
            video.error_message = f"GPT-4o analysis failed after {MAX_RETRIES} attempts: {last_error}"
            await db.flush()

            # Still create a failed Analysis record for audit trail
            analysis = Analysis(
                video_id=video.id,
                athlete_id=video.athlete_id,
                status=AnalysisStatus.failed,
                feedback_json={"error": last_error, "attempts": MAX_RETRIES},
            )
            db.add(analysis)
            await db.flush()
            return analysis

    # ── 5. Store Analysis ─────────────────────────────────────────────
    elapsed_ms = int((time.monotonic() - start_time) * 1000)

    # Determine if needs_human_review: low confidence + extreme scores
    needs_review = False
    if parsed is not None and parsed.confidence == ConfidenceLevel.low:
        if parsed.overall_score < 30 or parsed.overall_score > 90:
            needs_review = True

    # Build feedback_json as the full structured response
    feedback_json = parsed.model_dump() if parsed else {}

    analysis = Analysis(
        video_id=video.id,
        athlete_id=video.athlete_id,
        status=AnalysisStatus.completed,
        overall_score=parsed.overall_score if parsed else None,
        confidence_level=parsed.confidence if parsed else None,
        feedback_json=feedback_json,
        processing_time_ms=elapsed_ms,
    )
    db.add(analysis)

    # ── 6. Update Video status ────────────────────────────────────────
    video.status = VideoStatus.ready
    await db.flush()

    logger.info(
        "Analysis completed for video %s: overall=%s, confidence=%s, time=%dms",
        video_id,
        parsed.overall_score if parsed else "N/A",
        parsed.confidence.value if parsed else "N/A",
        elapsed_ms,
    )

    return analysis
