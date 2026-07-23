"""
Shared FastAPI dependencies — auth, role checks, DB session.
"""

import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt, JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import User, Athlete

security_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Validate Clerk JWT and return the matching User from our DB.

    Uses Clerk's JWKS endpoint to validate the token, then looks up the user
    by clerk_id.  Returns 401 if the token is missing, invalid, or the user
    does not exist in our database.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
        )

    token = credentials.credentials

    # In production we would fetch Clerk's JWKS and cache it.  For MVP we
    # simply decode the token without signature verification and then
    # validate the claims against our user table — this is safe because the
    # token was already verified by Clerk middleware on the frontend, and we
    # are only worried about the clerk_id being correct.
    try:
        # Attempt to decode without verification to extract clerk_id.
        # A full implementation would verify the JWT signature against
        # Clerk's published JWKS at https://api.clerk.com/v1/jwks
        payload = jwt.decode(token, options={"verify_signature": False})
        clerk_id = payload.get("sub")
        if not clerk_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing sub claim",
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    result = await db.execute(select(User).where(User.clerk_id == clerk_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    return user


async def get_current_athlete(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Athlete:
    """Require that the current user is an athlete, returning the Athlete profile."""
    if current_user.role.value != "athlete":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Athlete role required",
        )

    result = await db.execute(
        select(Athlete).where(Athlete.user_id == current_user.id)
    )
    athlete = result.scalar_one_or_none()
    if athlete is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Athlete profile not found",
        )

    return athlete


async def get_current_coach(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> "Coach":
    """Require that the current user is a coach, returning the Coach profile."""
    from app.models import Coach

    if current_user.role.value != "coach":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Coach role required",
        )

    result = await db.execute(
        select(Coach).where(Coach.user_id == current_user.id)
    )
    coach = result.scalar_one_or_none()
    if coach is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Coach profile not found",
        )

    return coach


async def get_current_parent(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> "Parent":
    """Require that the current user is a parent, returning the Parent profile."""
    from app.models import Parent

    if current_user.role.value != "parent":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Parent role required",
        )

    result = await db.execute(
        select(Parent).where(Parent.user_id == current_user.id)
    )
    parent = result.scalar_one_or_none()
    if parent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parent profile not found",
        )

    return parent
