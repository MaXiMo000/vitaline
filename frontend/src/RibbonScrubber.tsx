import { useMemo, useState } from "react";
import type { Observation } from "./api";
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
// of text sitting below the whole chart. describeChange() is deliberately
// swappable: step 7 replaces its canned template with a real LLM call
// without this component's layout changing.
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

  if (points.length < 2) {
    return (
      <div className="ribbon-empty">
        Not enough numeric data points to scrub yet (need at least 2 dated results for this analyte).
      </div>
    );
  }

  const active = points[index];
  const unit =
    observations.find((o) => o.observed_at && new Date(o.observed_at).getTime() === active.date.getTime())?.unit ?? null;
  const text = describeChange(points, index, display, unit);

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
