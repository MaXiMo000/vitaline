import type { Point } from "./Ribbon";

/** Canned (templated, deterministic) delta descriptions -- step 6's
 * placeholder for step 7's real LLM call. The interface is written so that
 * swap can happen without touching RibbonScrubber.tsx: whatever replaces
 * this returns the same shape of string, just from a model instead of a
 * template, prompted on the same "explain the delta" framing this already
 * establishes rather than restating the raw value.
 */
export function describeChange(points: Point[], index: number, display: string, unit: string | null): string {
  const p = points[index];
  const unitStr = unit ? ` ${unit}` : "";
  const dateStr = p.date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  if (index === 0) {
    return `First recorded ${display}: ${p.value}${unitStr} on ${dateStr}, flagged ${p.flag}.`;
  }

  const prev = points[index - 1];
  const delta = p.value - prev.value;
  const pct = prev.value !== 0 ? (delta / Math.abs(prev.value)) * 100 : null;
  const direction = delta > 0 ? "rose" : delta < 0 ? "fell" : "stayed flat";
  const pctStr = pct !== null && delta !== 0 ? ` (${pct > 0 ? "+" : ""}${pct.toFixed(1)}%)` : "";
  const prevDateStr = prev.date.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  let crossing = "";
  if (prev.flag !== p.flag) {
    if (p.flag === "normal") crossing = " This returned to the normal range.";
    else if (p.flag === "high" || p.flag === "low" || p.flag === "abnormal") {
      crossing = ` This crossed out of the normal range (now ${p.flag}).`;
    }
  }

  return `${display} ${direction} from ${prev.value}${unitStr} to ${p.value}${unitStr}${pctStr} between ${prevDateStr} and ${dateStr}.${crossing}`;
}
