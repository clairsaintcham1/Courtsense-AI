from fastapi import APIRouter

from app.api.endpoints import health

api_router = APIRouter()

# Health check
api_router.include_router(health.router, tags=["health"])
