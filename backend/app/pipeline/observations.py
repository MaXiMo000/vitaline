"""PDF bytes in, a list of normalized Observation records out.

Ties extract.py (PDF -> raw rows) -> mapping.py (name -> LOINC) -> units.py
(value -> canonical unit) -> ranges.py (value -> flag) into the one shape
the rest of Vitaline (the flat table, later the river visualization) reads.
Nothing here re-implements pipeline logic -- it only sequences the four
modules and decides, per row, whether the result is certain enough to trust
without a human looking at it.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from . import mapping, ranges, units
from .extract import ExtractResult, RawRow, extract


@dataclass
class Observation:
    source_doc_id: str
    raw_name: str
    loinc_code: str | None
    loinc_display: str | None
    mapping_stage: str
    mapping_confidence: float
    value: float | None          # canonical unit if the analyte+unit pair is known
    raw_value: str
    operator: str | None         # "<" / ">" / "<=" / ">=" for a censored result
    qualitative_text: str | None  # e.g. "NEGATIVE" -- not a number, not chartable
    unit: str | None              # canonical unit, or the raw unit if unconverted
    ref_low: float | None
    ref_high: float | None
    ref_source: str
    flag: str
    date: datetime | None
    date_source: str
    # Per LabLedger's own rule this project inherits: anything not certain
    # goes to a human rather than being guessed at. True when the LOINC
    # mapping is unresolved, or the analyte is known but the printed unit
    # has no audited conversion for it.
    needs_review: bool
    review_reason: str | None = None


def _observation_from_row(row: RawRow, doc: ExtractResult, source_doc_id: str) -> Observation:
    mapping_result = mapping.resolve(row.raw_name, row.raw_specimen)
    value_num, operator, qualitative_text = units.parse_value(row.raw_value)
    canonical_value, canonical_unit, _factor = units.to_canonical(
        mapping_result.loinc_code, value_num, row.raw_unit,
    )
    ref_low, ref_high, ref_source = ranges.resolve_range(
        row.raw_ref_range, mapping_result.loinc_code,
    )
    flag = ranges.flag_against_range(
        value_num, canonical_value, ref_low, ref_high, ref_source, row.raw_flag,
    )

    review_reason = None
    if mapping_result.stage == "unmapped":
        review_reason = mapping_result.note or "no LOINC match found"
    elif value_num is not None and mapping_result.loinc_code and canonical_unit is None:
        review_reason = f"no audited unit conversion for {row.raw_unit!r} on this analyte"

    return Observation(
        source_doc_id=source_doc_id,
        raw_name=row.raw_name,
        loinc_code=mapping_result.loinc_code,
        loinc_display=mapping_result.loinc_display,
        mapping_stage=mapping_result.stage,
        mapping_confidence=mapping_result.confidence,
        value=canonical_value if canonical_value is not None else value_num,
        raw_value=row.raw_value,
        operator=operator,
        qualitative_text=qualitative_text,
        unit=canonical_unit or row.raw_unit,
        ref_low=ref_low,
        ref_high=ref_high,
        ref_source=ref_source,
        flag=flag,
        date=doc.collected_at,
        date_source=doc.date_source,
        needs_review=review_reason is not None,
        review_reason=review_reason,
    )


def parse_document(pdf_bytes: bytes, source_doc_id: str) -> tuple[ExtractResult, list[Observation]]:
    """Like build_observations(), but also returns the document-level
    metadata (lab name, collection date) extract() already computed --
    callers that need to persist a Document record shouldn't have to
    re-parse the PDF just to read its lab name."""
    doc = extract(pdf_bytes)
    observations = [_observation_from_row(row, doc, source_doc_id) for row in doc.rows]
    return doc, observations


def build_observations(pdf_bytes: bytes, source_doc_id: str) -> list[Observation]:
    _doc, observations = parse_document(pdf_bytes, source_doc_id)
    return observations
