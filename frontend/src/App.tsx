import { useEffect, useMemo, useState } from "react";
import { fetchDocuments, fetchObservations, type DocumentSummary, type Observation } from "./api";
import MultiRibbon from "./MultiRibbon";
import RibbonScrubber from "./RibbonScrubber";
import SpecimenIntake from "./SpecimenIntake";
import "./App.css";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

function flagClass(flag: string): string {
  return `flag-${flag}`;
}

export default function App() {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedLoinc, setSelectedLoinc] = useState<string | null>(null);

  const reload = () => {
    fetchDocuments().then(setDocuments).catch((e) => setError(String(e)));
    fetchObservations().then(setObservations).catch((e) => setError(String(e)));
  };

  useEffect(reload, []);

  const sorted = [...observations].sort((a, b) => {
    const dateDiff = (a.observed_at ?? "").localeCompare(b.observed_at ?? "");
    return dateDiff !== 0 ? dateDiff : a.raw_name.localeCompare(b.raw_name);
  });

  const analytes = useMemo(() => {
    const byLoinc = new Map<string, { display: string; count: number }>();
    for (const o of observations) {
      if (!o.loinc_code || o.value === null || !o.observed_at) continue;
      const entry = byLoinc.get(o.loinc_code) ?? { display: o.loinc_display ?? o.raw_name, count: 0 };
      entry.count += 1;
      byLoinc.set(o.loinc_code, entry);
    }
    return [...byLoinc.entries()]
      .filter(([, v]) => v.count >= 2)
      .map(([loincCode, v]) => ({ loincCode, ...v }));
  }, [observations]);

  const activeLoinc = selectedLoinc && analytes.some((a) => a.loincCode === selectedLoinc)
    ? selectedLoinc
    : analytes[0]?.loincCode ?? null;
  const ribbonObservations = observations.filter((o) => o.loinc_code === activeLoinc);

  return (
    <div className="app-root">
      <header className="app-topbar">
        <div className="app-logo">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 15C5 12 7 12 9 15C11 18 13 18 15 15C17 12 19 12 21 15"
              stroke="white" strokeWidth="2.4" strokeLinecap="round" fill="none"
            />
          </svg>
        </div>
        <h1 className="app-title">Vitaline</h1>
        <span className="app-subtitle">A longitudinal health timeline that reads like a river</span>
      </header>

      {error && <div className="app-error">{error}</div>}

      <div className="app-body">
        <aside className="app-sidebar">
          <div>
            <div className="section-heading">
              <span className="eyebrow">Upload</span>
            </div>
            <SpecimenIntake onUploaded={reload} />
          </div>

          <div>
            <div className="section-heading">
              <span className="eyebrow">Documents ({documents.length})</span>
            </div>
            {documents.length === 0 ? (
              <div className="document-list-empty">No reports uploaded yet.</div>
            ) : (
              <div className="document-list">
                {documents.map((d) => (
                  <div key={d.id} className="document-row">
                    <div className="document-row-name">{d.filename}</div>
                    <div className="document-row-meta">
                      {d.lab_name ?? "unknown lab"} · {formatDate(d.uploaded_at)} · {d.observation_count} results
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        <main className="app-main">
          <div className="card section-card">
            <div className="section-heading">
              <span className="eyebrow">Trend</span>
            </div>
            {analytes.length === 0 ? (
              <div className="app-empty-state">
                Upload at least two dated reports with a shared analyte to see a ribbon.
              </div>
            ) : (
              <>
                <select
                  className="analyte-select"
                  value={activeLoinc ?? ""}
                  onChange={(e) => setSelectedLoinc(e.target.value)}
                >
                  {analytes.map((a) => (
                    <option key={a.loincCode} value={a.loincCode}>
                      {a.display} ({a.count} results)
                    </option>
                  ))}
                </select>
                <RibbonScrubber
                  observations={ribbonObservations}
                  display={analytes.find((a) => a.loincCode === activeLoinc)?.display ?? "Value"}
                />
              </>
            )}
          </div>

          <div className="card section-card">
            <div className="section-heading">
              <span className="eyebrow">All markers</span>
            </div>
            <MultiRibbon observations={observations} />
          </div>

          <div className="card section-card">
            <div className="section-heading">
              <span className="eyebrow">Observations ({sorted.length})</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Test</th>
                  <th>LOINC</th>
                  <th>Value</th>
                  <th>Unit</th>
                  <th>Range</th>
                  <th>Flag</th>
                  <th>Mapping</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((o) => (
                  <tr key={o.id} title={o.review_reason ?? undefined}>
                    <td>{formatDate(o.observed_at)}</td>
                    <td>{o.raw_name}</td>
                    <td>{o.loinc_code ?? (o.needs_review ? "⚠ unmapped" : "—")}</td>
                    <td>
                      {o.value !== null
                        ? `${o.operator ?? ""}${Math.round(o.value * 1000) / 1000}`
                        : (o.qualitative_text ?? "—")}
                    </td>
                    <td>{o.unit ?? "—"}</td>
                    <td>{o.ref_low !== null || o.ref_high !== null ? `${o.ref_low ?? ""}–${o.ref_high ?? ""}` : "—"}</td>
                    <td className={flagClass(o.flag)}>{o.flag}</td>
                    <td className={o.needs_review ? "review-warning" : undefined}>
                      {o.mapping_stage} {o.needs_review && "⚠"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  );
}
