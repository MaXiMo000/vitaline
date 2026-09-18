import { useMemo } from "react";
import type { Observation } from "./api";
import Ribbon, { observationsToPoints, PADDING, type Point } from "./Ribbon";
import { computeXScale, computeYScale } from "./ribbonScales";
import { pearson } from "./correlation";
import "./MultiRibbon.css";

interface Props {
  observations: Observation[]; // all observations, any analyte
  width?: number;
  rowHeight?: number;
  maxRows?: number;
}

interface Group {
  loincCode: string;
  display: string;
  points: Point[];
}

// Two analytes count as correlated only above this |r| -- high enough that
// a coincidental match on 3-4 shared visits is unlikely, not a formal
// significance test (this dataset is far too small for one).
const CORRELATION_THRESHOLD = 0.8;
const MIN_SHARED_POINTS = 3;

function matchedPairs(a: Point[], b: Point[]): [number[], number[]] {
  const byDateB = new Map(b.map((p) => [p.date.getTime(), p.value]));
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of a) {
    const v = byDateB.get(p.date.getTime());
    if (v !== undefined) {
      xs.push(p.value);
      ys.push(v);
    }
  }
  return [xs, ys];
}

function rowBottomPadding(isLast: boolean): number {
  return isLast ? PADDING.bottom : 8; // must match Ribbon.tsx's own showAxis-dependent padding
}

// Stacks several single-ribbon renderers on one shared time axis (step 4),
// then draws a tributary-merge connector between any two analytes whose
// time-aligned values are strongly correlated (step 5) -- a visual "these
// move together" cue, not a claim of causation, over however few shared
// visits this dataset happens to have.
export default function MultiRibbon({ observations, width = 720, rowHeight = 90, maxRows = 10 }: Props) {
  const groups: Group[] = useMemo(() => {
    const byLoinc = new Map<string, { display: string; rows: Observation[] }>();
    for (const o of observations) {
      if (!o.loinc_code || o.value === null || !o.observed_at) continue;
      const entry = byLoinc.get(o.loinc_code) ?? { display: o.loinc_display ?? o.raw_name, rows: [] };
      entry.rows.push(o);
      byLoinc.set(o.loinc_code, entry);
    }
    return [...byLoinc.entries()]
      .map(([loincCode, v]) => ({ loincCode, display: v.display, points: observationsToPoints(v.rows) }))
      .filter((g) => g.points.length >= 2)
      .slice(0, maxRows);
  }, [observations, maxRows]);

  const domain = useMemo((): [Date, Date] | null => {
    const dates = groups.flatMap((g) => g.points.map((p) => p.date.getTime()));
    return dates.length === 0 ? null : [new Date(Math.min(...dates)), new Date(Math.max(...dates))];
  }, [groups]);

  const innerWidth = width - PADDING.left - PADDING.right;
  const x = useMemo(() => (domain ? computeXScale(domain, innerWidth) : null), [domain, innerWidth]);

  const yScales = useMemo(
    () =>
      groups.map((g, i) => {
        const innerHeight = rowHeight - PADDING.top - rowBottomPadding(i === groups.length - 1);
        return computeYScale(g.points, innerHeight);
      }),
    [groups, rowHeight],
  );

  const correlations = useMemo(() => {
    const pairs: { i: number; j: number; r: number }[] = [];
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const [xs, ys] = matchedPairs(groups[i].points, groups[j].points);
        if (xs.length < MIN_SHARED_POINTS) continue;
        const r = pearson(xs, ys);
        if (Math.abs(r) >= CORRELATION_THRESHOLD) pairs.push({ i, j, r });
      }
    }
    return pairs;
  }, [groups]);

  if (!domain || !x) {
    return (
      <p style={{ opacity: 0.6, fontSize: 12 }}>
        Upload at least two dated reports with a shared analyte to see the stacked view.
      </p>
    );
  }

  const totalHeight = groups.length * rowHeight;

  return (
    <div>
      <div style={{ display: "flex" }}>
        <div style={{ width: 150, flexShrink: 0 }}>
          {groups.map((g) => (
            <div
              key={g.loincCode}
              className="multi-ribbon-label"
              style={{ height: rowHeight, display: "flex", alignItems: "center", justifyContent: "flex-end" }}
              title={g.display}
            >
              {g.display}
            </div>
          ))}
        </div>

        <svg width={width} height={totalHeight} className="ribbon-svg">
          {groups.map((g, i) => (
            <g key={g.loincCode} transform={`translate(0, ${i * rowHeight})`}>
              <Ribbon
                observations={observations.filter((o) => o.loinc_code === g.loincCode)}
                width={width}
                height={rowHeight}
                domain={domain}
                showAxis={i === groups.length - 1}
                asGroup
              />
            </g>
          ))}

          {correlations.map(({ i, j, r }, idx) => {
            const a = groups[i];
            const b = groups[j];
            const byDateB = new Map(b.points.map((p) => [p.date.getTime(), p]));
            return a.points.map((pa) => {
              const pb = byDateB.get(pa.date.getTime());
              if (!pb) return null;
              const cx = PADDING.left + (x as (d: Date) => number)(pa.date);
              const y1 = i * rowHeight + PADDING.top + yScales[i](pa.value);
              const y2 = j * rowHeight + PADDING.top + yScales[j](pb.value);
              return (
                <line
                  key={`${idx}-${pa.date.getTime()}`}
                  x1={cx} y1={y1} x2={cx} y2={y2}
                  className={r > 0 ? "tributary-link-positive" : "tributary-link-negative"}
                />
              );
            });
          })}
        </svg>
      </div>

      {correlations.length > 0 && (
        <p className="multi-ribbon-correlation-note">
          Tributaries merged: {correlations.map(({ i, j, r }) => `${groups[i].display} ↔ ${groups[j].display} (r=${r.toFixed(2)})`).join("; ")}
        </p>
      )}
    </div>
  );
}
