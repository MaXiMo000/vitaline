# Vitaline

**A longitudinal health timeline that reads like a river, not a spreadsheet.**

## The problem

Personal-health apps present lab trends as generic line charts in a dashboard — exactly what every AI-scaffolded health app looks like. The real value-add is a visualization where "this value is drifting out of normal" is *felt* instantly, not read off an axis.

## The signature UI — a river, not a chart

- Each biomarker renders as a **flowing ribbon** whose width and hue encode value and distance from the reference range, smoothly interpolated between test dates (spline-based, not straight line segments) — organic, like a river system, not a stock chart.
- The reference range is drawn as **soft channel walls** around the ribbon. When a value goes out of range, the ribbon visibly **floods past the walls** in a warning hue with a subtle ripple animation at the moment it crosses — an immediate, physical "this broke containment" cue instead of a red asterisk in a table row.
- Correlated markers (e.g. two lipid panel values moving together) get **visually merged tributaries** when a simple correlation check flags them, so relationships between markers are seen, not just read.
- Scrubbing a slider along the river surfaces an **annotation card connected by a thin line to the exact point on the ribbon it describes** — like a museum exhibit placard — so the AI's explanation is spatially anchored instead of being a wall of text below the chart.
- The upload flow is a **"specimen intake" screen** where OCR'd rows populate one at a time with a scan-line reveal as they're extracted, so the user visibly watches their real report being read, rather than staring at a generic spinner.

**Why this is unique:** almost every health-tracking app defaults to line/bar charts because that's what every charting library ships by default. A custom flowing-ribbon renderer with physical "flooding past the walls" semantics and spatially-anchored AI annotations is a genuinely different visual grammar.

## Architecture

- **Ingestion:** PDF → OCR/text extraction → row parsing → LOINC resolution → unit conversion → reference interval lookup. Prescriptions and wearable CSV exports feed the same normalized `observations` table later.
- **Backend:** FastAPI + MongoDB storing raw documents, parsed observations `{loinc_code, value, unit, ref_low, ref_high, date, source_doc_id}`, and a confidence flag for anything not certain enough to auto-resolve — uncertain items go to a human for confirmation.
- **Frontend:** React + a custom SVG/Canvas ribbon renderer (D3 for spline math and scales, custom rendering for the flooding/tributary effects — no off-the-shelf chart library does this).
- **AI layer:** LLM call per new observation batch, prompted to explain *deltas* ("this changed, here's plausible context") rather than restating the value, chunked and mapped to specific ribbon coordinates for the placard-anchoring.

## Build order

1. **Port the lab-parsing pipeline.** PDF-in → normalized observation records-out, standalone, no new UI.
2. **Flat table view of observations.** Confirms the data model (units, ranges, LOINC codes) is complete before visualizing it.
3. **Single-ribbon renderer for one marker.** Spline-based ribbon with channel walls for one biomarker over time. Get the flooding animation right here first.
4. **Multi-ribbon layout.** Stack multiple biomarker ribbons, handle vertical spacing so it reads cleanly with 5-10 markers at once.
5. **Tributary-merge for correlated markers.** Pearson correlation over paired time-aligned values above a threshold, plus the visual merge effect.
6. **Scrubber + anchored annotation card.** Slider and placard-with-connecting-line UI, wired to canned text first.
7. **Real AI annotations.** Swap canned text for actual LLM-generated delta explanations.
8. **Specimen-intake upload screen.** Build last — high-polish, doesn't block anything else.

## Status

- **Step 1 (port the lab-parsing pipeline) — done, standalone, verified end-to-end.** `backend/app/pipeline/` vendors `extract.py` (PDF → raw rows) and `units.py` (audited conversion factors) verbatim from this author's LabLedger project, plus `ranges.py` + `app/data/reference_config.py` (reference-interval resolution and flagging), both fully self-contained — no database coupling to carry over. `mapping.py` (printed name → LOINC code) is a **deliberately smaller** rewrite: LabLedger's own cascade has a learned-alias stage and an LLM-adjudication stage, both of which need a database Vitaline doesn't have yet; this ports only the two fully deterministic stages (exact match, then specimen-narrowed fuzzy match via `rapidfuzz`) against the vendored LOINC subset (`backend/data/loinc_lab.csv.gz`, 58k entries, carried over with its license — see `LOINC_LICENSE.txt`). `observations.py` sequences all four into one `Observation` record per row.
  - **A real bug was caught and fixed during this port**: the initial exact-match tie-break picked the *highest* `COMMON_TEST_RANK` among candidates, which is backwards — LOINC ranks 1 as the single most commonly ordered test and climbs from there, with `0` meaning "not ranked" rather than "most common." This was silently resolving common analytes (glucose, sodium, ferritin) to obscure dialysis-fluid/24-hour-urine variants of the same name, which in turn meant `units.py`'s per-LOINC-code conversion table never matched and every value looked unconvertible. Caught by testing against a real synthetic report before building anything on top of it, not discovered later.
  - Verified with a real synthetic PDF (`backend/tests/fixtures.py`, built with `reportlab` the same way LabLedger builds its own test fixtures): 7 passing tests (`backend/tests/test_observations.py`) covering exact LOINC resolution, an out-of-range flag, an audited non-1.0 unit conversion (µmol/L → mg/dL for creatinine), a qualitative (non-numeric) result, and the "don't guess a reference range without sex/age data" case.
- **Step 2 (flat table view) — done, verified end-to-end.** `backend/app/main.py` (FastAPI) exposes `POST /documents` (upload a PDF, get back parsed observations, persisted) and `GET /documents` / `GET /observations`. `frontend/` (Vite + React + TS) is a plain sorted table, no chart — proves the full pipeline through a real HTTP upload and a real browser render before any time goes into the ribbon renderer. Verified live: uploaded the same synthetic PDF through the actual `<input type=file>` (not just via `curl`), confirmed both documents and all 10 observations (two uploads) render correctly.
- **Deviation from the original architecture note, and why:** the plan said "FastAPI + MongoDB." This uses FastAPI + SQLAlchemy (SQLite by default, `DATABASE_URL` env var for Postgres) instead — the same pattern already proven out in this author's Playhead project. Mongo/Beanie is what LabLedger's *full* mapping cascade (user alias learning, review queue) would need to stay consistent with that project, but this step doesn't build that cascade yet, so there was nothing Mongo-specific to justify the extra setup friction right now. Worth revisiting if/when the LLM-adjudication and alias-learning stages get ported.
- **Inherited limitation, stated honestly, not silently dropped:** `extract.py` has no OCR path — a scanned, image-only PDF (no text layer) will extract zero rows. LabLedger's own docstring flags this as a known gap, not fixed here either.
- **Step 3 (single-ribbon renderer) — done, verified live.** `frontend/src/Ribbon.tsx`: a smooth Catmull-Rom spline for the value line, channel walls drawn from each point's own `ref_low`/`ref_high` (not assumed constant — a lab can print a different interval per visit), and a **step gradient** along the ribbon's stroke that holds each reading's color from the moment it was measured until the next one changes it, with a sharp transition exactly at the data point — not a blended smear between two states. A value outside the channel gets a pulsing ripple animation at the exact crossing point (loops continuously; the scrubber that will pause it on a specific reading comes in step 6).
  - `backend/tests/fixtures.py`'s PDF generator was extended (`visit_date`, `ferritin_value` params, defaults unchanged so the existing 7 tests still pass) to generate a real multi-visit series for this test, rather than faking one in the frontend.
  - Verified live in-browser against 5 real uploaded PDFs spanning Jan 2025 → Mar 2026 with ferritin falling from 96 → 15 ng/mL (crossing out of its 24-336 range on the last two visits): inspected the actual rendered SVG's gradient `<stop>` elements and confirmed the color transitions from green to orange exactly at the third-to-fourth point boundary (matching the real flag data), confirmed exactly 2 ripple/dot pairs (matching the 2 out-of-range readings), and confirmed the ripple's CSS animation is real and looping (`animation-name: ribbon-ripple`, `infinite`).
- **Not started:** steps 4-8 (multi-ribbon layout, tributary-merge for correlated markers, scrubber + anchored annotations, real AI annotations, specimen-intake upload screen).

### Running locally

```
cd backend
python -m venv .venv && .venv/Scripts/activate  # or source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

```
cd frontend
npm install
VITE_API_URL=http://localhost:8000 npm run dev
```

### LOINC attribution

`backend/data/loinc_lab.csv.gz` is a filtered subset of the LOINC Table (see `backend/data/loinc_manifest.json` for the exact filter and release version), used under the LOINC License (`backend/data/LOINC_LICENSE.txt`). LOINC® is a registered trademark of Regenstrief Institute, Inc.
