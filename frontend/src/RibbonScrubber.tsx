import { useEffect, useMemo, useState } from "react";
import { fetchAnnotation, type Observation } from "./api";
import Ribbon, { observationsToPoints, PADDING } from "./Ribbon";
import { computeXScale, computeYScale } from "./ribbonScales";
import { describeChange } from "./annotations";
import "./RibbonScrubber.css";

interface Props {
  observations: Observation[]; // all rows for one loinc_code
  display: string;
  width?: number;
  height?: number;
}

const CARD_WIDTH = 220;

// Step 6: a slider over the actual data points (not a continuous timeline --
// there's nothing meaningful to say about a moment between two readings)
// plus a placard connected by a thin line to the exact point it describes,
// per the plan's museum-exhibit framing -- spatially anchored, not a wall
// of text sitting below the whole chart.
//
// Step 7: describeChange()'s canned template is the fallback, not the
// primary source -- on each scrub this asks the backend for a real LLM
// explanation (POST /observations/{id}/annotate) and swaps it in if one
// comes back. A missing API key, a rate limit, or any API failure all
// resolve to the same thing here: fetchAnnotation() returns null and the
// canned text stays on screen, so an LLM outage degrades the card, it
// never breaks it.
export default function RibbonScrubber({ observations, display, width = 720, height = 260 }: Props) {
  const points = useMemo(() => observationsToPoints(observations), [observations]);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(points.length - 1, 0));
  const index = Math.min(activeIndex, Math.max(points.length - 1, 0));

  const innerWidth = width - PADDING.left - PADDING.right;
  const innerHeight = height - PADDING.top - PADDING.bottom;
  const x = useMemo(
    () => computeXScale([points[0]?.date ?? new Date(), points[points.length - 1]?.date ?? new Date()], innerWidth),
    [points, innerWidth],
  );
  const y = useMemo(() => computeYScale(points, innerHeight), [points, innerHeight]);

  const active = points[index];
  const activeObs = active
    ? observations.find((o) => o.observed_at && new Date(o.observed_at).getTime() === active.date.getTime())
    : undefined;

  const [aiText, setAiText] = useState<string | null>(activeObs?.llm_annotation ?? null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (!activeObs) return;
    if (activeObs.llm_annotation) {
      setAiText(activeObs.llm_annotation);
      setAiLoading(false);
      return;
    }
    let cancelled = false;
    setAiText(null);
    setAiLoading(true);
    fetchAnnotation(activeObs.id).then((result) => {
      if (cancelled) return;
      setAiLoading(false);
      if (result) setAiText(result.text);
    });
    return () => {
      // Scrubbing away mid-fetch cancels it; without this the card kept
      // saying "asking AI..." next to the next point's cached annotation.
      cancelled = true;
      setAiLoading(false);
    };
  }, [activeObs?.id]);

  if (points.length < 2 || !active) {
    return (
      <div className="ribbon-empty">
        Not enough numeric data points to scrub yet (need at least 2 dated results for this analyte).
      </div>
    );
  }

  const cannedText = describeChange(points, index, display, activeObs?.unit ?? null);
  const text = aiText ?? cannedText;

  const px = PADDING.left + x(active.date);
  const py = PADDING.top + y(active.value);

  // Keep the card on-canvas: flip above/below and left/right based on which
  // quadrant the point falls in, rather than letting it run off the edge.
  const cardLeft = px + CARD_WIDTH + 24 > width ? px - CARD_WIDTH - 16 : px + 16;
  const cardTop = py < height / 2 ? py + 24 : py - 70;

  return (
    <div className="scrubber-container" style={{ width, height }}>
      <Ribbon observations={observations} width={width} height={height} showAxis />

      <svg className="scrubber-overlay" width={width} height={height}>
        <line x1={px} y1={py} x2={cardLeft + (cardLeft < px ? CARD_WIDTH : 0)} y2={cardTop + 10} className="scrubber-connector" />
        <circle cx={px} cy={py} r={5} className="scrubber-point" />
      </svg>

      <div className="annotation-card" style={{ left: cardLeft, top: cardTop, width: CARD_WIDTH }}>
        {text}
        {aiLoading && <span className="annotation-card-source"> (asking AI...)</span>}
        {!aiLoading && aiText && <span className="annotation-card-source"> — AI</span>}
      </div>

      <input
        type="range"
        className="scrubber-slider"
        min={0}
        max={points.length - 1}
        step={1}
        value={index}
        onChange={(e) => setActiveIndex(Number(e.target.value))}
      />
    </div>
  );
}
