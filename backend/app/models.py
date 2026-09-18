from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    filename: Mapped[str] = mapped_column(String)
    lab_name: Mapped[str | None] = mapped_column(String, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    observations: Mapped[list["Observation"]] = relationship(back_populates="document")


class Observation(Base):
    __tablename__ = "observations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"), index=True)
    document: Mapped["Document"] = relationship(back_populates="observations")

    raw_name: Mapped[str] = mapped_column(String)
    loinc_code: Mapped[str | None] = mapped_column(String, index=True, nullable=True)
    loinc_display: Mapped[str | None] = mapped_column(String, nullable=True)
    mapping_stage: Mapped[str] = mapped_column(String)
    mapping_confidence: Mapped[float] = mapped_column(Float)

    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    raw_value: Mapped[str] = mapped_column(String)
    operator: Mapped[str | None] = mapped_column(String, nullable=True)
    qualitative_text: Mapped[str | None] = mapped_column(String, nullable=True)
    unit: Mapped[str | None] = mapped_column(String, nullable=True)

    ref_low: Mapped[float | None] = mapped_column(Float, nullable=True)
    ref_high: Mapped[float | None] = mapped_column(Float, nullable=True)
    ref_source: Mapped[str] = mapped_column(String)
    flag: Mapped[str] = mapped_column(String)

    observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    date_source: Mapped[str] = mapped_column(String)

    needs_review: Mapped[bool] = mapped_column(Boolean, default=False)
    review_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
