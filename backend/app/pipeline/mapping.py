"""Resolve a printed lab test name to a LOINC code.

A deliberately smaller cascade than LabLedger's own mapping.py -- this is
the "prove the pipeline standalone" version from the plan. LabLedger's
stage 0 (learned per-user aliases) and stage 4 (LLM adjudication for the
residue) both need a database and are not ported yet; only the two fully
deterministic stages that need no database at all are:

    stage 1  exact      exact match on a LOINC name field     conf 0.95
    stage 2  narrowing  specimen -> SYSTEM axis                (not a decision)
    stage 3  fuzzy       rapidfuzz over the narrowed set        conf = f(score)
             unmapped   -> caller decides what to do with it (review queue,
                           once Vitaline has one)

Normalization and the narrowing invariant (a filter may never exclude the
correct answer -- it falls back to the wider set if it would empty the
candidate list) are carried over from LabLedger's mapping.py unchanged.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache

from rapidfuzz import fuzz, process

from .loinc_db import LoincEntry, load_loinc_table

_SPECIMEN_SUFFIX = re.compile(
    r",?\s*\b(SERUM|PLASMA|SER/PLAS|SERUM/PLASMA|BLOOD|WHOLE BLOOD|URINE|"
    r"RANDOM URINE|24 HR URINE|CSF|STOOL|PLAS)\b\s*$", re.IGNORECASE)
_NOISE = re.compile(r"\b(LEVEL|TEST|RESULT|QUANT|QUANTITATIVE|SERUM LEVEL)\b\s*$", re.IGNORECASE)
_PUNCT = re.compile(r"[^\w\s%/+.-]")
_WS = re.compile(r"\s+")


def normalize(name: str) -> str:
    """Fold a printed test name for matching: upper, de-punctuated, unsuffixed."""
    s = (name or "").upper().strip()
    s = _PUNCT.sub(" ", s)
    for _ in range(2):  # "FERRITIN, SERUM LEVEL" -> "FERRITIN"
        s = _SPECIMEN_SUFFIX.sub("", s).strip(" ,-")
        s = _NOISE.sub("", s).strip(" ,-")
    return _WS.sub(" ", s).strip()


# Printed specimen -> acceptable LOINC SYSTEM values.
SYSTEM_MAP: dict[str, tuple[str, ...]] = {
    "SERUM": ("Ser", "Ser/Plas", "Plas"),
    "PLASMA": ("Plas", "Ser/Plas", "Ser"),
    "SERUM/PLASMA": ("Ser/Plas", "Ser", "Plas"),
    "BLOOD": ("Bld", "Ser/Plas", "Ser", "Plas", "Bld/Tiss"),
    "WHOLE BLOOD": ("Bld", "Bld/Tiss"),
    "URINE": ("Urine",),
    "CSF": ("CSF",),
    "STOOL": ("Stool",),
    "SALIVA": ("Saliva",),
}

FUZZY_ACCEPT = 92.0   # rapidfuzz score required to auto-accept at stage 3
FUZZY_MARGIN = 6.0    # ...and how far it must beat the runner-up
FUZZY_FLOOR = 60.0    # below this a candidate is not worth surfacing at all


@dataclass
class MappingResult:
    stage: str = "unmapped"
    loinc_code: str | None = None
    loinc_display: str | None = None
    confidence: float = 0.0
    note: str | None = None


@lru_cache(maxsize=1)
def _exact_index() -> dict[str, list[LoincEntry]]:
    """normalized name -> every LOINC entry that name could refer to, built
    once so a per-row lookup is a dict hit, not an O(58k) scan."""
    index: dict[str, list[LoincEntry]] = {}
    for entry in load_loinc_table():
        for name in (entry.long_common_name, entry.shortname, entry.component, entry.display_name):
            key = normalize(name)
            if key:
                index.setdefault(key, []).append(entry)
    return index


def _narrow_by_specimen(table: tuple[LoincEntry, ...], specimen: str | None) -> tuple[LoincEntry, ...]:
    if not specimen:
        return table
    systems = SYSTEM_MAP.get(specimen.upper())
    if not systems:
        return table
    narrowed = tuple(e for e in table if e.system in systems)
    # Never let narrowing exclude the correct answer outright.
    return narrowed or table


def resolve(printed_name: str, specimen: str | None = None) -> MappingResult:
    norm = normalize(printed_name)
    if not norm:
        return MappingResult(note="empty name after normalization")

    candidates = _exact_index().get(norm)
    if candidates:
        # A real ambiguity, found by testing, not assumed: LOINC's own
        # COMPONENT field for a per-cell index like MCHC is literally
        # "Hemoglobin" (MCHC *is* a hemoglobin concentration, per red
        # cell) -- so indexing on bare COMPONENT alone (needed for plain
        # printed names like "GLUCOSE" that never match a more specific
        # field) also pulls in indices that share the same component but
        # mean something else entirely. A bare printed name on a report
        # means the substance's own concentration, not a derived per-cell
        # index, so entitic properties (the "Ent*" prefix) are deprioritized
        # first -- but never dropped outright if they're all there is,
        # same "never exclude the correct answer" rule used for specimen
        # narrowing above.
        non_entitic = [e for e in candidates if not e.property.startswith("Ent")]
        pool = non_entitic or candidates
        # Ties are common (several analytes share a display name across
        # specimens). LOINC's COMMON_TEST_RANK is 1 for the single most
        # frequently ordered test overall and climbs from there -- 0 means
        # "not in the ranked set at all," the opposite of "most common,"
        # so it's excluded from the comparison rather than winning it.
        ranked = [e for e in pool if e.common_test_rank > 0]
        best = min(ranked, key=lambda e: e.common_test_rank) if ranked else pool[0]
        return MappingResult(stage="exact", loinc_code=best.loinc_code,
                              loinc_display=best.display_name, confidence=0.95)

    narrowed = _narrow_by_specimen(load_loinc_table(), specimen)
    choices = {i: normalize(e.component) for i, e in enumerate(narrowed)}
    matches = process.extract(norm, choices, scorer=fuzz.WRatio, limit=2)
    if not matches:
        return MappingResult(note="no fuzzy candidates")

    (_, top_score, top_idx), *rest = matches
    runner_up_score = rest[0][1] if rest else 0.0
    entry = narrowed[top_idx]
    if top_score >= FUZZY_ACCEPT and (top_score - runner_up_score) >= FUZZY_MARGIN:
        return MappingResult(stage="narrowed_fuzzy", loinc_code=entry.loinc_code,
                              loinc_display=entry.display_name, confidence=top_score / 100)
    if top_score >= FUZZY_FLOOR:
        return MappingResult(
            confidence=top_score / 100,
            note=f"best fuzzy candidate below acceptance threshold: {entry.display_name!r} ({top_score:.0f})",
        )
    return MappingResult(note="no candidate above floor")
