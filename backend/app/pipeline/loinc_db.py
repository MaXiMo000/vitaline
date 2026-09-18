"""Loads the vendored LOINC lab subset into memory, once.

The CSV (`backend/data/loinc_lab.csv.gz`) was carried over verbatim from
this author's LabLedger project (see `data/loinc_manifest.json` for its
provenance and rebuild recipe) -- see `data/LOINC_LICENSE.txt` for LOINC's
own license terms, which this file's distribution must keep intact.

Unlike LabLedger's own mapping stage, this loads straight from the CSV into
an in-memory list rather than a MongoDB collection (`LoincEntry` there) --
Vitaline doesn't have a database-backed alias/review system yet, and 58k
rows in memory is cheap enough that it doesn't need one yet either.
"""
from __future__ import annotations

import csv
import gzip
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

DATA_PATH = Path(__file__).parent.parent.parent / "data" / "loinc_lab.csv.gz"


@dataclass(frozen=True)
class LoincEntry:
    loinc_code: str
    component: str
    system: str
    property: str
    long_common_name: str
    shortname: str
    display_name: str
    common_test_rank: int


@lru_cache(maxsize=1)
def load_loinc_table() -> tuple[LoincEntry, ...]:
    with gzip.open(DATA_PATH, "rt", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return tuple(
            LoincEntry(
                loinc_code=row["LOINC_NUM"],
                component=row["COMPONENT"],
                system=row["SYSTEM"],
                property=row["PROPERTY"],
                long_common_name=row["LONG_COMMON_NAME"],
                shortname=row["SHORTNAME"],
                display_name=row["DisplayName"],
                common_test_rank=int(row["COMMON_TEST_RANK"] or 0),
            )
            for row in reader
        )
