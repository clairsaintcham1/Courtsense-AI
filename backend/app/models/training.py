import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, Enum, ForeignKey, Index, Integer, String, Text,
    UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.athlete import SkillLevel

# Import pgvector for the embedding column
from pgvector.sqlalchemy import Vector  # type: ignore[import-untyped]


class PlanStatus(str, enum.Enum):
    active = "active"
    completed = "completed"
    abandoned = "abandoned"


class PlanGenerator(str, enum.Enum):
    ai = "ai"
    coach = "coach"


class DrillCategory(str, enum.Enum):
    shooting = "shooting"
    dribbling = "dribbling"
    footwork = "footwork"
    defense = "defense"
    passing = "passing"
    conditioning = "conditioning"
    iq = "iq"


class TrainingPlan(Base):
    __tablename__ = "training_plans"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    athlete_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False
    )
    week_start_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[PlanStatus] = mapped_column(
        Enum(PlanStatus, name="plan_status"), default=PlanStatus.active
    )
    generated_by: Mapped[PlanGenerator] = mapped_column(
        Enum(PlanGenerator, name="plan_generator"), nullable=False
    )
    coach_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("coaches.id", ondelete="SET NULL"), nullable=True
    )
    plan_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    athlete: Mapped["Athlete"] = relationship("Athlete", back_populates="training_plans")
    coach: Mapped["Coach | None"] = relationship("Coach", back_populates="assigned_plans")
    workouts: Mapped[list["Workout"]] = relationship("Workout", back_populates="plan", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_plans_athlete_week", "athlete_id", "week_start_date"),
        UniqueConstraint("athlete_id", "week_start_date"),
    )


class Workout(Base):
    __tablename__ = "workouts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("training_plans.id", ondelete="CASCADE"), nullable=False
    )
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    drills_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    athlete_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    plan: Mapped["TrainingPlan"] = relationship("TrainingPlan", back_populates="workouts")

    __table_args__ = (
        CheckConstraint("day_of_week >= 0 AND day_of_week <= 6", name="ck_day_of_week_range"),
        Index("idx_workouts_plan", "plan_id"),
    )


class DrillLibrary(Base):
    __tablename__ = "drill_library"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[DrillCategory] = mapped_column(
        Enum(DrillCategory, name="drill_category"), nullable=False
    )
    difficulty: Mapped[SkillLevel] = mapped_column(
        Enum(SkillLevel, name="drill_difficulty"), nullable=False
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    video_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    equipment_needed: Mapped[list[str] | None] = mapped_column(
        "equipment_needed", String(255), nullable=True
    )
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(
        Vector(1536), nullable=True
    )
