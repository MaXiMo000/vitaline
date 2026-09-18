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

# (name, value, unit, printed_range, flag)
ROWS = [
    ("GLUCOSE", "95", "mg/dL", "65-99", ""),
    ("FERRITIN, SERUM", "18", "ng/mL", "24-336", "L"),
    ("SODIUM", "140", "mmol/L", "134-144", ""),
    # Printed in umol/L specifically to exercise units.to_canonical's
    # non-1.0 factor (0.0113 -> mg/dL) rather than the trivial 1.0 case.
    ("CREATININE", "80", "umol/L", "", ""),
    ("PROTEIN", "NEGATIVE", "", "NEGATIVE", ""),
]


def make_sample_pdf() -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    y = 740

    c.setFont("Helvetica-Bold", 13)
    c.drawString(60, y, "Quest Diagnostics")
    y -= 18
    c.setFont("Helvetica", 8)
    c.drawString(60, y, "Patient: TEST, SYNTHETIC        DOB: 01/01/1990        Sex: F")
    y -= 11
    c.drawString(60, y, "Collected: 03/14/2026                Reported: 03/15/2026")
    y -= 20

    c.setFont("Helvetica-Bold", 8)
    for label, x in [("TEST NAME", 60), ("RESULT", 230), ("UNITS", 310), ("REFERENCE RANGE", 400)]:
        c.drawString(x, y, label)
    y -= 16

    c.setFont("Helvetica-Bold", 9)
    c.drawString(60, y, "CHEMISTRY (SERUM)")
    y -= 14
    c.setFont("Helvetica", 8)
    for name, value, unit, ref, flag in ROWS:
        c.drawString(60, y, name)
        c.drawString(230, y, value)
        c.drawString(280, y, flag)
        c.drawString(310, y, unit)
        c.drawString(400, y, ref)
        y -= 12

    c.save()
    return buf.getvalue()
