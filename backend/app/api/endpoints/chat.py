"""
Chat endpoints — AI coach conversation with RAG-powered responses.
"""

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_athlete
from app.database import get_db
from app.models import Athlete, ChatMessage
from app.models.chat import ChatRole

router = APIRouter(tags=["chat"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class ChatRequest(BaseModel):
    message: str


class ChatMessageResponse(BaseModel):
    id: uuid.UUID
    athlete_id: uuid.UUID
    role: str
    content: str
    created_at: datetime


class ChatReplyResponse(BaseModel):
    reply: ChatMessageResponse


class ChatHistoryResponse(BaseModel):
    messages: list[ChatMessageResponse]
    total: int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/chat", response_model=ChatReplyResponse)
async def send_message(
    body: ChatRequest,
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Send a message to Coach AI and receive an AI-powered reply.

    Uses RAG: embeds the user message, searches the drill library via pgvector,
    loads the athlete's profile + skill ratings + latest analysis, then calls
    GPT-4o-mini for a contextual response. Both user message and AI reply are
    persisted to chat_messages.

    Rate limit: 30 messages per hour per athlete (HTTP 429 on exceed).
    """
    from app.services.chat_service import get_coach_response, RateLimitExceeded

    # Basic validation
    if not body.message or not body.message.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message cannot be empty",
        )

    if len(body.message) > 2000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message is too long (max 2000 characters)",
        )

    try:
        reply_text = await get_coach_response(
            athlete_id=athlete.id,
            message=body.message.strip(),
            db=db,
        )
    except RateLimitExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
            headers={"Retry-After": "3600"},
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Coach AI is temporarily unavailable. Please try again shortly.",
        )

    # Fetch the last assistant message to return
    result = await db.execute(
        select(ChatMessage)
        .where(
            ChatMessage.athlete_id == athlete.id,
            ChatMessage.role == ChatRole.assistant,
        )
        .order_by(ChatMessage.created_at.desc())
        .limit(1)
    )
    last_reply = result.scalar_one_or_none()

    if last_reply is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve AI reply",
        )

    return ChatReplyResponse(
        reply=ChatMessageResponse(
            id=last_reply.id,
            athlete_id=last_reply.athlete_id,
            role=last_reply.role.value,
            content=last_reply.content,
            created_at=last_reply.created_at,
        )
    )


@router.get("/chat/history", response_model=ChatHistoryResponse)
async def get_history(
    athlete: Annotated[Athlete, Depends(get_current_athlete)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=50, ge=1, le=100),
    before: uuid.UUID | None = Query(default=None),
):
    """Get paginated chat history for the current athlete.

    - `limit`: max number of messages to return (default 50, max 100)
    - `before`: cursor — return messages older than this message ID
    """
    # Count total
    count_q = select(func.count(ChatMessage.id)).where(
        ChatMessage.athlete_id == athlete.id
    )
    total = (await db.execute(count_q)).scalar() or 0

    # Build query
    query = (
        select(ChatMessage)
        .where(ChatMessage.athlete_id == athlete.id)
    )

    if before:
        # Get the created_at of the cursor message
        cursor_result = await db.execute(
            select(ChatMessage.created_at).where(ChatMessage.id == before)
        )
        cursor_ts = cursor_result.scalar_one_or_none()
        if cursor_ts:
            query = query.where(ChatMessage.created_at < cursor_ts)

    query = query.order_by(ChatMessage.created_at.desc()).limit(limit)

    result = await db.execute(query)
    messages = list(result.scalars().all())
    messages.reverse()  # return in chronological order

    return ChatHistoryResponse(
        messages=[
            ChatMessageResponse(
                id=m.id,
                athlete_id=m.athlete_id,
                role=m.role.value,
                content=m.content,
                created_at=m.created_at,
            )
            for m in messages
        ],
        total=total,
    )
