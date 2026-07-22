import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SkillLevel(str, enum.Enum):
    beginner = "beginner"
    intermediate = "intermediate"
    advanced = "advanced"
    elite = "elite"


class Athlete(Base):
    __tablename__ = "athletes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    display_name: Mapped[str | None] = mapped_column(String, nullable=True)
    age_group: Mapped[str | None] = mapped_column(String, nullable=True)
    skill_level: Mapped[SkillLevel] = mapped_column(
        Enum(SkillLevel, name="skill_level"), default=SkillLevel.beginner
    )
    position: Mapped[str | None] = mapped_column(String, nullable=True)
    height_cm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight_kg: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="athlete")
    videos: Mapped[list["Video"]] = relationship("Video", back_populates="athlete", cascade="all, delete-orphan")
    analyses: Mapped[list["Analysis"]] = relationship("Analysis", back_populates="athlete", cascade="all, delete-orphan")
    training_plans: Mapped[list["TrainingPlan"]] = relationship("TrainingPlan", back_populates="athlete", cascade="all, delete-orphan")
    chat_messages: Mapped[list["ChatMessage"]] = relationship("ChatMessage", back_populates="athlete", cascade="all, delete-orphan")
    progress_events: Mapped[list["ProgressEvent"]] = relationship("ProgressEvent", back_populates="athlete", cascade="all, delete-orphan")
    skill_ratings: Mapped[list["SkillRating"]] = relationship("SkillRating", back_populates="athlete", cascade="all, delete-orphan")
    team_memberships: Mapped[list["TeamMember"]] = relationship("TeamMember", back_populates="athlete", cascade="all, delete-orphan")
    parent_links: Mapped[list["ParentAthleteLink"]] = relationship("ParentAthleteLink", back_populates="athlete", cascade="all, delete-orphan")
    badges: Mapped[list["AthleteBadge"]] = relationship("AthleteBadge", back_populates="athlete", cascade="all, delete-orphan")
    challenge_participants: Mapped[list["ChallengeParticipant"]] = relationship("ChallengeParticipant", back_populates="athlete", cascade="all, delete-orphan")
