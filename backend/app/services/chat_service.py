"""
AI Coach Chat service — RAG-powered conversational basketball coach.

Architecture:
  User message → embed → pgvector search drill_library (top 5)
  → fetch last 20 chat_messages → load athlete profile + skill_ratings + latest analysis
  → assemble context → GPT-4o-mini → store both messages → return reply
"""

import json
import logging
import uuid
from datetime import datetime, timedelta
from typing import Any

from openai import AsyncOpenAI
from sqlalchemy import select, text, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.analysis import Analysis, AnalysisStatus
from app.models.athlete import Athlete
from app.models.chat import ChatMessage, ChatRole
from app.models.progress import SkillRating

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

EMBEDDING_MODEL = "text-embedding-3-small"
CHAT_MODEL = "gpt-4o-mini"
RAG_TOP_K = 5
RAG_THRESHOLD = 0.7  # minimum cosine similarity for drill results
CHAT_HISTORY_LIMIT = 20
RATE_LIMIT = 30  # messages per hour per athlete

# ---------------------------------------------------------------------------
# System prompt — exactly as specified in architecture-pt3.md, Section 1c
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are Coach AI, a supportive and knowledgeable basketball coach for youth athletes
(ages 8–18). Your tone is encouraging, age-appropriate, and specific — never generic.
You give actionable advice: concrete drills, form tips, training routines.

Guidelines:
- If asked about technique, cite specific mechanics (e.g., "keep your elbow at 90 degrees")
- If you don't know something, say "I'm not sure about that — let me focus on what I can help with"
- Reference the athlete's recent analysis data when relevant (provided in context)
- Keep responses under 200 words unless the athlete asks for detailed explanations
- Never recommend dangerous exercises or suggest ignoring pain/injury
- Use simple language for younger athletes; more technical for advanced players

You have access to a drill library (provided in context). When recommending drills,
reference specific drills from that library by name."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _format_skill_ratings(ratings: list[dict[str, Any]]) -> str:
    """Format skill rating dicts into a readable string for context."""
    if not ratings:
        return "No ratings available"
    parts = []
    for r in ratings:
        cat = r.get("skill_category", r.get("category", "unknown"))
        score = r.get("rating", r.get("score", "N/A"))
        parts.append(f"{cat}: {score}/10")
    return ", ".join(parts)


def _format_drills(drill_rows: list[tuple]) -> str:
    """Format pgvector search results into a readable drill list."""
    if not drill_rows:
        return "No relevant drills found."

    lines = []
    for row in drill_rows:
        # row structure: (id, name, category, difficulty, description, duration_minutes, equipment_needed, similarity)
        name = row[1]
        category = row[2] if len(row) > 2 else "general"
        difficulty = row[3] if len(row) > 3 else "beginner"
        duration = row[5] if len(row) > 5 else "?"
        description = row[4] if len(row) > 4 else ""
        lines.append(
            f"  - [{category}] {name} (difficulty: {difficulty}, {duration}min)\n"
            f"    {description}"
        )
    return "\n".join(lines)


def _summarize_analysis(feedback_json: dict | None) -> str:
    """Create a short summary of the latest analysis for chat context."""
    if not feedback_json:
        return "No analysis data available."

    parts = []
    overall = feedback_json.get("overall_score")
    if overall:
        parts.append(f"Overall score: {overall}/100")

    confidence = feedback_json.get("confidence")
    if confidence:
        parts.append(f"Confidence: {confidence}")

    summary = feedback_json.get("summary")
    if summary:
        parts.append(f"Summary: {summary}")

    priority = feedback_json.get("priority_areas", [])
    if priority:
        parts.append(f"Priority areas: {', '.join(priority)}")

    categories = feedback_json.get("categories", {})
    if categories:
        cat_parts = []
        for cat_name, cat_data in categories.items():
            if isinstance(cat_data, dict):
                score = cat_data.get("score")
                if score is not None:
                    cat_parts.append(f"{cat_name}: {score}/10")
        if cat_parts:
            parts.append(f"Category scores: {', '.join(cat_parts)}")

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Main service function
# ---------------------------------------------------------------------------


async def get_coach_response(
    athlete_id: uuid.UUID,
    message: str,
    db: AsyncSession,
) -> str:
    """Generate an AI coach reply using RAG over drill library and athlete data.

    Returns the assistant's text reply. Both the user message and assistant
    reply are persisted to chat_messages.
    """
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    # ── Rate limit check ─────────────────────────────────────────────────
    one_hour_ago = datetime.utcnow() - timedelta(hours=1)
    count_q = select(func.count(ChatMessage.id)).where(
        ChatMessage.athlete_id == athlete_id,
        ChatMessage.role == ChatRole.user,
        ChatMessage.created_at >= one_hour_ago,
    )
    msg_count = (await db.execute(count_q)).scalar() or 0
    if msg_count >= RATE_LIMIT:
        raise RateLimitExceeded(
            f"You've reached the chat limit for now — try again in a bit. "
            f"({msg_count}/{RATE_LIMIT} messages this hour)"
        )

    # ── Load athlete profile ─────────────────────────────────────────────
    result = await db.execute(select(Athlete).where(Athlete.id == athlete_id))
    athlete = result.scalar_one_or_none()
    if athlete is None:
        raise ValueError(f"Athlete {athlete_id} not found")

    # ── Load latest analysis ─────────────────────────────────────────────
    result = await db.execute(
        select(Analysis)
        .where(
            Analysis.athlete_id == athlete_id,
            Analysis.status == AnalysisStatus.completed,
        )
        .order_by(Analysis.created_at.desc())
        .limit(1)
    )
    latest_analysis = result.scalar_one_or_none()

    # ── Load skill ratings ───────────────────────────────────────────────
    result = await db.execute(
        select(SkillRating).where(SkillRating.athlete_id == athlete_id)
    )
    skill_ratings = result.scalars().all()
    skill_ratings_raw = [
        {"skill_category": sr.skill_category, "rating": sr.rating}
        for sr in skill_ratings
    ]

    # If no ratings in table, pull from latest analysis
    if not skill_ratings_raw and latest_analysis and latest_analysis.feedback_json:
        categories = latest_analysis.feedback_json.get("categories", {})
        for cat_name, cat_data in categories.items():
            score = cat_data.get("score") if isinstance(cat_data, dict) else None
            if score is not None:
                skill_ratings_raw.append({
                    "skill_category": cat_name,
                    "rating": score,
                })

    # ── RAG: embed user message and search drill_library ─────────────────
    embedding_response = await client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=message,
    )
    query_embedding = embedding_response.data[0].embedding

    embedding_str = f"[{', '.join(str(x) for x in query_embedding)}]"

    search_sql = text("""
        SELECT id, name, category, difficulty, description, duration_minutes,
               equipment_needed,
               1 - (embedding <=> :embedding::vector) AS similarity
        FROM drill_library
        WHERE embedding IS NOT NULL
          AND 1 - (embedding <=> :embedding::vector) > :threshold
        ORDER BY embedding <=> :embedding
        LIMIT :limit
    """)

    search_result = await db.execute(
        search_sql,
        {
            "embedding": embedding_str,
            "threshold": RAG_THRESHOLD,
            "limit": RAG_TOP_K,
        },
    )
    drill_rows = search_result.fetchall()

    # ── Load chat history ────────────────────────────────────────────────
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.athlete_id == athlete_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(CHAT_HISTORY_LIMIT)
    )
    history = list(result.scalars().all())
    history.reverse()  # chronological order

    # ── Assemble context ─────────────────────────────────────────────────
    athlete_context = (
        f"Athlete: {athlete.display_name or 'Athlete'}\n"
        f"Age group: {athlete.age_group or 'youth'}\n"
        f"Skill level: {athlete.skill_level.value if athlete.skill_level else 'beginner'}\n"
        f"Position: {athlete.position or 'all-around'}"
    )

    analysis_summary = _summarize_analysis(
        latest_analysis.feedback_json if latest_analysis else None
    )

    skill_ratings_str = _format_skill_ratings(skill_ratings_raw)
    drill_context = _format_drills(drill_rows)

    context_block = (
        f"=== ATHLETE PROFILE ===\n{athlete_context}\n\n"
        f"=== SKILL RATINGS ===\n{skill_ratings_str}\n\n"
        f"=== LATEST ANALYSIS ===\n{analysis_summary}\n\n"
        f"=== RELEVANT DRILLS ===\n{drill_context}"
    )

    # ── Build messages array for GPT-4o-mini ────────────────────────────
    messages: list[dict[str, str]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": context_block},
    ]

    # Add chat history
    for msg in history:
        role = "assistant" if msg.role == ChatRole.assistant else "user"
        messages.append({"role": role, "content": msg.content})

    # Don't re-add the current message to history yet — it gets added as user msg
    # But for context we need to include it
    messages.append({"role": "user", "content": message})

    # ── Call GPT-4o-mini ─────────────────────────────────────────────────
    try:
        response = await client.chat.completions.create(
            model=CHAT_MODEL,
            messages=messages,
            max_tokens=500,
            temperature=0.7,
        )
        reply = response.choices[0].message.content or ""
    except Exception as exc:
        logger.error("GPT-4o-mini chat failed: %s", str(exc))
        raise

    # ── Store messages ───────────────────────────────────────────────────
    user_msg = ChatMessage(
        athlete_id=athlete_id,
        role=ChatRole.user,
        content=message,
    )
    db.add(user_msg)

    assistant_msg = ChatMessage(
        athlete_id=athlete_id,
        role=ChatRole.assistant,
        content=reply,
    )
    db.add(assistant_msg)

    await db.flush()

    logger.info(
        "Chat: athlete=%s, user_msg_len=%d, reply_len=%d, drills_found=%d",
        athlete_id,
        len(message),
        len(reply),
        len(drill_rows),
    )

    return reply


# ---------------------------------------------------------------------------
# Custom exception
# ---------------------------------------------------------------------------


class RateLimitExceeded(Exception):
    """Raised when an athlete exceeds the chat rate limit."""
    pass
