import { useEffect, useMemo, useState } from "react";
import { fetchDocuments, fetchObservations, uploadDocument, type DocumentSummary, type Observation } from "./api";
import Ribbon from "./Ribbon";
import MultiRibbon from "./MultiRibbon";

// Deliberately the plainest possible view: a sorted table, no chart, no
// styling beyond what's needed to read it. This exists to prove the data
// model (PDF -> LOINC-mapped, unit-converted, range-flagged observations)
// is complete and correct before any time goes into the real river
// renderer.
const FLAG_COLOR: Record<string, string> = {
  high: "#ff7b72",
  low: "#ffb84a",
  abnormal: "#ff7b72",
  normal: "#7ee787",
  unknown: "#888",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

export default function App() {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedLoinc, setSelectedLoinc] = useState<string | null>(null);

  const reload = () => {
    fetchDocuments().then(setDocuments).catch((e) => setError(String(e)));
    fetchObservations().then(setObservations).catch((e) => setError(String(e)));
  };

  useEffect(reload, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadDocument(file);
      reload();
    } catch (err) {
      setError(String(err));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

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
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20 }}>Vitaline</h1>

      {error && <p style={{ color: "#f66" }}>{error}</p>}

      <section style={{ marginBottom: 24 }}>
        <label>
          Upload a lab report (PDF):{" "}
          <input type="file" accept="application/pdf" onChange={handleUpload} disabled={uploading} />
        </label>
        {uploading && <span style={{ marginLeft: 8, opacity: 0.7 }}>parsing...</span>}
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 14 }}>Documents ({documents.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Filename</th>
              <th>Lab</th>
              <th>Uploaded</th>
              <th>Observations</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => (
              <tr key={d.id}>
                <td>{d.filename}</td>
                <td>{d.lab_name ?? "—"}</td>
                <td>{formatDate(d.uploaded_at)}</td>
                <td>{d.observation_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 14 }}>Trend (step 3 — single-ribbon renderer)</h2>
        {analytes.length === 0 ? (
          <p style={{ opacity: 0.6, fontSize: 12 }}>
            Upload at least two dated reports with a shared analyte to see a ribbon.
          </p>
        ) : (
          <>
            <label>
              Analyte:{" "}
              <select value={activeLoinc ?? ""} onChange={(e) => setSelectedLoinc(e.target.value)}>
                {analytes.map((a) => (
                  <option key={a.loincCode} value={a.loincCode}>
                    {a.display} ({a.count} results)
                  </option>
                ))}
              </select>
            </label>
            <div style={{ marginTop: 12 }}>
              <Ribbon observations={ribbonObservations} />
            </div>
          </>
        )}
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 14 }}>All markers (step 4 — multi-ribbon layout)</h2>
        <MultiRibbon observations={observations} />
      </section>

      <section>
        <h2 style={{ fontSize: 14 }}>Observations ({sorted.length})</h2>
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
                <td style={{ color: FLAG_COLOR[o.flag] ?? "#ccc" }}>{o.flag}</td>
                <td style={{ opacity: 0.6, fontSize: 11 }}>
                  {o.mapping_stage} {o.needs_review && "⚠"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
