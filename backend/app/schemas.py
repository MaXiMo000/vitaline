from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ObservationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    document_id: int
    raw_name: str
    loinc_code: str | None
    loinc_display: str | None
    mapping_stage: str
    mapping_confidence: float
    value: float | None
    raw_value: str
    operator: str | None
    qualitative_text: str | None
    unit: str | None
    ref_low: float | None
    ref_high: float | None
    ref_source: str
    flag: str
    observed_at: datetime | None
    date_source: str
    needs_review: bool
    review_reason: str | None


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    lab_name: str | None
    uploaded_at: datetime
    observation_count: int
