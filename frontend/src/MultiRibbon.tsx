import { useMemo } from "react";
import type { Observation } from "./api";
import Ribbon from "./Ribbon";
import "./MultiRibbon.css";

interface Props {
  observations: Observation[]; // all observations, any analyte
  width?: number;
  rowHeight?: number;
  maxRows?: number;
}

// Stacks several single-ribbon renderers on one shared time axis, per the
// plan's own ordering: get one ribbon right first (step 3), then handle the
// layout problem of several at once (step 4) as a separate concern -- the
// per-ribbon rendering logic here is untouched, only the shared domain and
// compact spacing are new.
export default function MultiRibbon({ observations, width = 720, rowHeight = 90, maxRows = 10 }: Props) {
  const groups = useMemo(() => {
    const byLoinc = new Map<string, { display: string; rows: Observation[] }>();
    for (const o of observations) {
      if (!o.loinc_code || o.value === null || !o.observed_at) continue;
      const entry = byLoinc.get(o.loinc_code) ?? { display: o.loinc_display ?? o.raw_name, rows: [] };
      entry.rows.push(o);
      byLoinc.set(o.loinc_code, entry);
    }
    return [...byLoinc.entries()]
      .filter(([, v]) => v.rows.length >= 2)
      .slice(0, maxRows);
  }, [observations, maxRows]);

  const domain = useMemo((): [Date, Date] | null => {
    const dates = groups.flatMap(([, v]) => v.rows.map((o) => new Date(o.observed_at as string).getTime()));
    if (dates.length === 0) return null;
    return [new Date(Math.min(...dates)), new Date(Math.max(...dates))];
  }, [groups]);

  if (!domain) {
    return (
      <p style={{ opacity: 0.6, fontSize: 12 }}>
        Upload at least two dated reports with a shared analyte to see the stacked view.
      </p>
    );
  }

  return (
    <div>
      {groups.map(([loincCode, v], i) => (
        <div key={loincCode} className="multi-ribbon-row">
          <span className="multi-ribbon-label" title={v.display}>
            {v.display}
          </span>
          <Ribbon
            observations={v.rows}
            width={width}
            height={rowHeight}
            domain={domain}
            showAxis={i === groups.length - 1}
          />
        </div>
      ))}
    </div>
  );
}
