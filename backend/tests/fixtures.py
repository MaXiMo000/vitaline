"""Builds a synthetic, Quest-style lab report PDF for tests.

Same technique as LabLedger's `scripts/make_sample_reports.py`: reportlab
draws each column at a fixed x-position, so pdfplumber's
`extract_text(layout=True)` reconstructs the multi-space gaps extract.py's
tokenizer relies on to tell columns apart. Not a real person, not a real
result -- values are chosen specifically to exercise the pipeline (a normal
value, an out-of-range value, a unit that needs conversion, a qualitative
result).
"""
from __future__ import annotations

import io

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

FERRITIN_RANGE = (24.0, 336.0)


def _flag_for(value: float, low: float, high: float) -> str:
    if value < low:
        return "L"
    if value > high:
        return "H"
    return ""


HEMOGLOBIN_RANGE = (12.0, 15.5)


def make_sample_pdf(
    visit_date: str = "03/14/2026", ferritin_value: float = 18, glucose_value: float = 95,
    hemoglobin_value: float = 13.5,
) -> bytes:
    """visit_date, ferritin_value, glucose_value, and hemoglobin_value are
    parameterized so tests/scripts can generate a multi-visit series --
    including analytes trending together, for the tributary-merge
    correlation feature -- without duplicating this whole layout per call
    site. Ferritin and hemoglobin declining together is a real clinical
    pattern (iron-deficiency anemia), not just a contrived correlated pair.
    Every other row stays fixed -- they exist to exercise the pipeline's
    other behaviors (unit conversion, qualitative results), not to trend."""
    ferritin_flag = _flag_for(ferritin_value, *FERRITIN_RANGE)
    glucose_flag = _flag_for(glucose_value, 65, 99)
    hemoglobin_flag = _flag_for(hemoglobin_value, *HEMOGLOBIN_RANGE)
    # (name, value, unit, printed_range, flag)
    rows = [
        ("GLUCOSE", str(glucose_value), "mg/dL", "65-99", glucose_flag),
        ("FERRITIN, SERUM", str(ferritin_value), "ng/mL", "24-336", ferritin_flag),
        ("HEMOGLOBIN", str(hemoglobin_value), "g/dL", "12.0-15.5", hemoglobin_flag),
        ("SODIUM", "140", "mmol/L", "134-144", ""),
        # Printed in umol/L specifically to exercise units.to_canonical's
        # non-1.0 factor (0.0113 -> mg/dL) rather than the trivial 1.0 case.
        ("CREATININE", "80", "umol/L", "", ""),
        ("PROTEIN", "NEGATIVE", "", "NEGATIVE", ""),
    ]

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    y = 740

    c.setFont("Helvetica-Bold", 13)
    c.drawString(60, y, "Quest Diagnostics")
    y -= 18
    c.setFont("Helvetica", 8)
    c.drawString(60, y, "Patient: TEST, SYNTHETIC        DOB: 01/01/1990        Sex: F")
    y -= 11
    c.drawString(60, y, f"Collected: {visit_date}                Reported: {visit_date}")
    y -= 20

    c.setFont("Helvetica-Bold", 8)
    for label, x in [("TEST NAME", 60), ("RESULT", 230), ("UNITS", 310), ("REFERENCE RANGE", 400)]:
        c.drawString(x, y, label)
    y -= 16

    c.setFont("Helvetica-Bold", 9)
    c.drawString(60, y, "CHEMISTRY (SERUM)")
    y -= 14
    c.setFont("Helvetica", 8)
    for name, value, unit, ref, flag in rows:
        c.drawString(60, y, name)
        c.drawString(230, y, value)
        c.drawString(280, y, flag)
        c.drawString(310, y, unit)
        c.drawString(400, y, ref)
        y -= 12

    c.save()
    return buf.getvalue()
