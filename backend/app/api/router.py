from fastapi import APIRouter

from app.api.endpoints import health, videos, analyses, training, chat, progress, coach, parent

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

# Progress tracking & skill ratings
api_router.include_router(progress.router, tags=["progress"])

# Coach — team management
api_router.include_router(coach.router, tags=["coach"])

# Parent — linked athlete monitoring
api_router.include_router(parent.router, tags=["parent"])
