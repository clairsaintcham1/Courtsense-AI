import enum
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Index, Integer, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AnalysisStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class ConfidenceLevel(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    video_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("videos.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    athlete_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[AnalysisStatus] = mapped_column(
        Enum(AnalysisStatus, name="analysis_status"), default=AnalysisStatus.pending
    )
    overall_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    feedback_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    confidence_level: Mapped[ConfidenceLevel | None] = mapped_column(
        Enum(ConfidenceLevel, name="confidence_level"), nullable=True
    )
    processing_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    video: Mapped["Video"] = relationship("Video", back_populates="analysis")
    athlete: Mapped["Athlete"] = relationship("Athlete", back_populates="analyses")

    __table_args__ = (
        CheckConstraint("overall_score IS NULL OR (overall_score >= 1 AND overall_score <= 100)", name="ck_overall_score_range"),
        Index("idx_analyses_athlete_created", "athlete_id", "created_at"),
    )
