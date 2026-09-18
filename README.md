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

Scaffold stage — step 1 in progress.
