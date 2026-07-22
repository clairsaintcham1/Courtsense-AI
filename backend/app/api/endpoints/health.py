from fastapi import APIRouter

from app.config import settings

router = APIRouter()


@router.get("/health")
async def health_check():
    """Health check endpoint used for uptime monitoring.

    Checks DB connectivity. Redis is checked lazily — returns "not_configured"
    if REDIS_URL is not set.
    """
    db_status = "disconnected"
    redis_status = "not_configured"

    # Check database connectivity
    try:
        from sqlalchemy import text
        from app.database import engine
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception:
        db_status = "disconnected"

    # Check Redis connectivity (lazy)
    if settings.REDIS_URL and settings.REDIS_URL != "redis://localhost:6379/0":
        try:
            import redis.asyncio as aioredis
            r = aioredis.from_url(settings.REDIS_URL)
            await r.ping()
            await r.close()
            redis_status = "connected"
        except Exception:
            redis_status = "disconnected"
    else:
        redis_status = "not_configured"

    return {
        "status": "ok" if db_status == "connected" else "degraded",
        "db": db_status,
        "redis": redis_status,
    }
