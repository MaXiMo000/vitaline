import { useMemo } from "react";
import { scaleLinear, scaleTime } from "d3-scale";
import { area, curveCatmullRom, line } from "d3-shape";
import type { Observation } from "./api";
import "./Ribbon.css";

interface Props {
  observations: Observation[]; // all rows for one loinc_code
  width?: number;
  height?: number;
  // When several ribbons are stacked (MultiRibbon), they all need to share
  // one time axis so a date lines up vertically across analytes -- without
  // this, each ribbon would independently scale to its own first/last
  // result and the stack wouldn't align.
  domain?: [Date, Date];
  showAxis?: boolean;
}

interface Point {
  date: Date;
  value: number;
  refLow: number | null;
  refHigh: number | null;
  flag: string;
}

const RIBBON_THICKNESS = 10;
const PADDING = { top: 20, right: 20, bottom: 28, left: 20 };
const CURVE = curveCatmullRom.alpha(0.5);

const FLAG_COLOR: Record<string, string> = {
  normal: "#7ee787",
  high: "#ff7b72",
  low: "#ffb84a",
  abnormal: "#ff7b72",
  unknown: "#888",
};

function colorFor(flag: string): string {
  return FLAG_COLOR[flag] ?? FLAG_COLOR.unknown;
}

/** A step gradient, not a blend: the ribbon holds each reading's color from
 * the moment it was measured until the next reading changes it, with a
 * sharp transition at the measurement itself -- "this is what the value
 * was told you at each point," not a smeared average between two states. */
function buildStepGradientStops(points: Point[], xOf: (p: Point) => number, innerWidth: number) {
  const stops: { offset: number; color: string }[] = [];
  points.forEach((p, i) => {
    const frac = Math.min(Math.max(xOf(p) / innerWidth, 0), 1);
    const color = colorFor(p.flag);
    if (i === 0) {
      stops.push({ offset: 0, color });
    } else {
      const prevColor = colorFor(points[i - 1].flag);
      stops.push({ offset: Math.max(frac - 0.001, 0), color: prevColor });
      stops.push({ offset: frac, color });
    }
  });
  return stops;
}

export default function Ribbon({ observations, width = 720, height = 260, domain, showAxis = true }: Props) {
  const points: Point[] = useMemo(
    () =>
      observations
        .filter((o) => o.value !== null && o.observed_at)
        .map((o) => ({
          date: new Date(o.observed_at as string),
          value: o.value as number,
          refLow: o.ref_low,
          refHigh: o.ref_high,
          flag: o.flag,
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [observations],
  );

  const bottomPadding = showAxis ? PADDING.bottom : 8;
  const innerWidth = width - PADDING.left - PADDING.right;
  const innerHeight = height - PADDING.top - bottomPadding;

  const x = useMemo(
    () =>
      scaleTime()
        .domain(domain ?? [points[0]?.date ?? new Date(), points[points.length - 1]?.date ?? new Date()])
        .range([0, innerWidth]),
    [points, innerWidth, domain],
  );

  const y = useMemo(() => {
    const allValues = points.flatMap((p) => [p.value, p.refLow ?? p.value, p.refHigh ?? p.value]);
    const yMin = Math.min(...allValues);
    const yMax = Math.max(...allValues);
    const pad = (yMax - yMin) * 0.2 || Math.abs(yMax) * 0.2 || 1;
    return scaleLinear().domain([yMin - pad, yMax + pad]).range([innerHeight, 0]);
  }, [points, innerHeight]);

  if (points.length < 2) {
    return (
      <div className="ribbon-empty">
        Not enough numeric data points to draw a ribbon yet (need at least 2 dated results for this analyte).
      </div>
    );
  }

  const valueLine = line<Point>().x((p) => x(p.date)).y((p) => y(p.value)).curve(CURVE);
  const hasChannel = points.every((p) => p.refLow !== null && p.refHigh !== null);
  const channelArea = hasChannel
    ? area<Point>().x((p) => x(p.date)).y0((p) => y(p.refLow as number)).y1((p) => y(p.refHigh as number)).curve(CURVE)(points)
    : null;
  const channelTop = hasChannel ? line<Point>().x((p) => x(p.date)).y((p) => y(p.refHigh as number)).curve(CURVE)(points) : null;
  const channelBottom = hasChannel ? line<Point>().x((p) => x(p.date)).y((p) => y(p.refLow as number)).curve(CURVE)(points) : null;

  const gradientId = `ribbon-gradient-${observations[0]?.loinc_code ?? "x"}`;
  const stops = buildStepGradientStops(points, (p) => x(p.date), innerWidth);
  const outOfRange = points.filter((p) => p.flag === "high" || p.flag === "low" || p.flag === "abnormal");

  return (
    <svg width={width} height={height} className="ribbon-svg">
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
          {stops.map((s, i) => (
            <stop key={i} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
      </defs>
      <g transform={`translate(${PADDING.left},${PADDING.top})`}>
        {channelArea && <path d={channelArea} className="ribbon-channel-fill" />}
        {channelTop && <path d={channelTop} className="ribbon-channel-wall" />}
        {channelBottom && <path d={channelBottom} className="ribbon-channel-wall" />}

        <path d={valueLine(points) ?? ""} className="ribbon-body" stroke={`url(#${gradientId})`} strokeWidth={RIBBON_THICKNESS} />
        <path d={valueLine(points) ?? ""} className="ribbon-centerline" />

        {outOfRange.map((p, i) => (
          <g key={i} transform={`translate(${x(p.date)},${y(p.value)})`}>
            <circle r={4} className="ribbon-flood-dot" />
            <circle r={4} className="ribbon-flood-ripple" style={{ animationDelay: `${i * 0.3}s` }} />
          </g>
        ))}

        {showAxis &&
          points.map((p, i) => (
            <text key={i} x={x(p.date)} y={innerHeight + 18} textAnchor="middle" className="ribbon-axis-label">
              {p.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </text>
          ))}
      </g>
    </svg>
  );
}
