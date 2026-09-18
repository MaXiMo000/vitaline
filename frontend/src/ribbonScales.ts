import { scaleLinear, scaleTime } from "d3-scale";

export interface ScalablePoint {
  date: Date;
  value: number;
  refLow: number | null;
  refHigh: number | null;
}

/** Shared with MultiRibbon.tsx so a tributary-merge connector line can land
 * on the exact same y-coordinate Ribbon.tsx itself draws that value at --
 * two independent copies of this formula would drift the moment one of
 * them changed. */
export function computeYScale(points: ScalablePoint[], innerHeight: number) {
  const allValues = points.flatMap((p) => [p.value, p.refLow ?? p.value, p.refHigh ?? p.value]);
  const yMin = Math.min(...allValues);
  const yMax = Math.max(...allValues);
  const pad = (yMax - yMin) * 0.2 || Math.abs(yMax) * 0.2 || 1;
  return scaleLinear().domain([yMin - pad, yMax + pad]).range([innerHeight, 0]);
}

export function computeXScale(domain: [Date, Date], innerWidth: number) {
  return scaleTime().domain(domain).range([0, innerWidth]);
}
