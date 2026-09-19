import { useRef, useState } from "react";
import { fetchObservationsByDocument, uploadDocument, type DocumentSummary, type Observation } from "./api";
import "./SpecimenIntake.css";

interface Props {
  onUploaded: () => void;
}

type Phase = "idle" | "uploading" | "revealing";

// Step 8: the "specimen intake" screen. The honest version of the plan's
// "watch your real report being read" moment -- extract.py runs
// synchronously and returns every row at once, so this is a paced reveal
// of a response that has already fully arrived, not a live OCR progress
// stream. Framed that way deliberately rather than faking a claim this
// project can't back up; see SpecimenIntake.css for the wipe animation.
export default function SpecimenIntake({ onUploaded }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [doc, setDoc] = useState<DocumentSummary | null>(null);
  const [rows, setRows] = useState<Observation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPhase("uploading");
    setRows([]);
    try {
      const uploaded = await uploadDocument(file);
      setDoc(uploaded);
      const observations = await fetchObservationsByDocument(uploaded.id);
      setRows(observations);
      setPhase("revealing");
      onUploaded();
    } catch (err) {
      setError(String(err));
      setPhase("idle");
    } finally {
      e.target.value = "";
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        onChange={handleFile}
        disabled={phase === "uploading"}
        style={{ display: "none" }}
      />
      <button
        className="intake-upload-button"
        onClick={() => inputRef.current?.click()}
        disabled={phase === "uploading"}
      >
        {phase === "uploading" ? "Reading..." : "＋ Upload lab report (PDF)"}
      </button>

      {error && <p className="intake-error">{error}</p>}

      {phase !== "idle" && (
        <div className="intake-slip">
          <div className="intake-header">
            <span className="intake-title">Specimen intake</span>
          </div>
          <div className="intake-meta">
            {doc?.filename ?? "reading..."} {doc?.lab_name ? `— ${doc.lab_name}` : ""}
          </div>

          {phase === "uploading" && <p className="intake-status">extracting rows...</p>}
          {phase === "revealing" && (
            <p className="intake-status">
              {rows.length} result{rows.length === 1 ? "" : "s"} read
            </p>
          )}

          <div className="intake-rows">
            {rows.map((o, i) => (
              <div key={o.id} className="intake-row" style={{ animationDelay: `${i * 90}ms` }}>
                <div className="intake-row-top">
                  <span className="intake-row-name">{o.raw_name}</span>
                  <span className={o.needs_review ? "intake-review-flag" : `flag-${o.flag}`}>
                    {o.needs_review ? "⚠" : o.flag}
                  </span>
                </div>
                <div className="intake-row-bottom">
                  {o.value !== null ? `${o.operator ?? ""}${o.value} ${o.unit ?? ""}` : (o.qualitative_text ?? "—")}
                  {o.loinc_code && ` · ${o.loinc_code}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
