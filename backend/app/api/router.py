from fastapi import APIRouter

from app.api.endpoints import health, videos

api_router = APIRouter()

# Health check
api_router.include_router(health.router, tags=["health"])

# Videos
api_router.include_router(videos.router, tags=["videos"])
