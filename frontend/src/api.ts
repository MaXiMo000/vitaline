const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export interface DocumentSummary {
  id: number;
  filename: string;
  lab_name: string | null;
  uploaded_at: string;
  observation_count: number;
}

export interface Observation {
  id: number;
  document_id: number;
  raw_name: string;
  loinc_code: string | null;
  loinc_display: string | null;
  mapping_stage: string;
  mapping_confidence: number;
  value: number | null;
  raw_value: string;
  operator: string | null;
  qualitative_text: string | null;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  ref_source: string;
  flag: string;
  observed_at: string | null;
  date_source: string;
  needs_review: boolean;
  review_reason: string | null;
}

export async function fetchDocuments(): Promise<DocumentSummary[]> {
  const res = await fetch(`${API_URL}/documents`);
  if (!res.ok) throw new Error(`GET /documents failed: ${res.status}`);
  return res.json();
}

export async function fetchObservations(): Promise<Observation[]> {
  const res = await fetch(`${API_URL}/observations`);
  if (!res.ok) throw new Error(`GET /observations failed: ${res.status}`);
  return res.json();
}

export async function fetchObservationsByDocument(documentId: number): Promise<Observation[]> {
  const res = await fetch(`${API_URL}/observations?document_id=${documentId}`);
  if (!res.ok) throw new Error(`GET /observations?document_id failed: ${res.status}`);
  return res.json();
}

export async function uploadDocument(file: File): Promise<DocumentSummary> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_URL}/documents`, { method: "POST", body: formData });
  if (!res.ok) throw new Error(`POST /documents failed: ${res.status}`);
  return res.json();
}
