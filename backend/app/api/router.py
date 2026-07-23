from fastapi import APIRouter

from app.api.endpoints import health, videos, analyses, training, chat

api_router = APIRouter()

# Health check
api_router.include_router(health.router, tags=["health"])

# Videos
api_router.include_router(videos.router, tags=["videos"])

# Analyses
api_router.include_router(analyses.router, tags=["analyses"])

# Training plans & workouts
api_router.include_router(training.router, tags=["training"])

# AI Coach chat
api_router.include_router(chat.router, tags=["chat"])
