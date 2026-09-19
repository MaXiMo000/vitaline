from __future__ import annotations

import os

from fastapi import Depends, FastAPI, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import llm, models, schemas
from .database import Base, engine, get_db
from .middleware import MaxBodySizeMiddleware, SecurityHeadersMiddleware
from .pipeline.extract import UnreadablePDFError
from .pipeline.observations import parse_document
from .security import verify_api_key

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Vitaline API")

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(MaxBodySizeMiddleware)

# Real origin allowlist, not "*" -- set ALLOWED_ORIGINS (comma-separated) for
# any deployment beyond default local dev ports.
_default_origins = "http://localhost:5173,http://localhost:5174,http://localhost:5185,http://127.0.0.1:5173"
allowed_origins = os.environ.get("ALLOWED_ORIGINS", _default_origins).split(",")
app.add_middleware(
    CORSMiddleware, allow_origins=allowed_origins, allow_methods=["*"], allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post(
    "/documents", response_model=schemas.DocumentOut, status_code=201,
    dependencies=[Depends(verify_api_key)],
)
@limiter.limit("10/minute")
async def upload_document(request: Request, file: UploadFile, db: Session = Depends(get_db)):
    pdf_bytes = await file.read()
    try:
        extracted, observations = parse_document(pdf_bytes, source_doc_id=file.filename or "upload")
    except UnreadablePDFError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    doc_row = models.Document(filename=file.filename or "upload", lab_name=extracted.lab_name)
    db.add(doc_row)
    db.flush()  # assigns doc_row.id without committing yet

    for obs in observations:
        db.add(models.Observation(
            document_id=doc_row.id,
            raw_name=obs.raw_name,
            loinc_code=obs.loinc_code,
            loinc_display=obs.loinc_display,
            mapping_stage=obs.mapping_stage,
            mapping_confidence=obs.mapping_confidence,
            value=obs.value,
            raw_value=obs.raw_value,
            operator=obs.operator,
            qualitative_text=obs.qualitative_text,
            unit=obs.unit,
            ref_low=obs.ref_low,
            ref_high=obs.ref_high,
            ref_source=obs.ref_source,
            flag=obs.flag,
            observed_at=obs.date,
            date_source=obs.date_source,
            needs_review=obs.needs_review,
            review_reason=obs.review_reason,
        ))
    db.commit()
    db.refresh(doc_row)

    return schemas.DocumentOut(
        id=doc_row.id, filename=doc_row.filename, lab_name=doc_row.lab_name,
        uploaded_at=doc_row.uploaded_at, observation_count=len(observations),
    )


@app.get("/documents", response_model=list[schemas.DocumentOut], dependencies=[Depends(verify_api_key)])
def list_documents(db: Session = Depends(get_db)):
    rows = db.execute(
        select(
            models.Document,
            func.count(models.Observation.id).label("observation_count"),
        )
        .outerjoin(models.Observation)
        .group_by(models.Document.id)
        .order_by(models.Document.uploaded_at.desc())
    ).all()
    return [
        schemas.DocumentOut(
            id=doc.id, filename=doc.filename, lab_name=doc.lab_name,
            uploaded_at=doc.uploaded_at, observation_count=count,
        )
        for doc, count in rows
    ]


@app.get("/observations", response_model=list[schemas.ObservationOut], dependencies=[Depends(verify_api_key)])
def list_observations(
    loinc_code: str | None = None, document_id: int | None = None, db: Session = Depends(get_db),
):
    query = select(models.Observation).order_by(models.Observation.observed_at)
    if loinc_code:
        query = query.where(models.Observation.loinc_code == loinc_code)
    if document_id is not None:
        query = query.where(models.Observation.document_id == document_id)
    return db.scalars(query).all()


@app.post(
    "/observations/{observation_id}/annotate", response_model=schemas.AnnotationOut,
    dependencies=[Depends(verify_api_key)],
)
@limiter.limit("20/minute")
def annotate_observation(request: Request, observation_id: int, db: Session = Depends(get_db)):
    obs = db.get(models.Observation, observation_id)
    if obs is None:
        raise HTTPException(status_code=404, detail="observation not found")

    if obs.llm_annotation:
        return schemas.AnnotationOut(text=obs.llm_annotation, cached=True)

    if obs.value is None or obs.observed_at is None or not obs.loinc_code:
        raise HTTPException(status_code=422, detail="observation has no numeric, dated value to explain")

    prev = db.scalar(
        select(models.Observation)
        .where(
            models.Observation.loinc_code == obs.loinc_code,
            models.Observation.observed_at < obs.observed_at,
            models.Observation.value.is_not(None),
        )
        .order_by(models.Observation.observed_at.desc())
    )
    if prev is None:
        # This is the first recorded point for this analyte -- the frontend's
        # own canned "first recorded" message already covers this case, so
        # there is no delta here for an LLM to explain.
        raise HTTPException(status_code=422, detail="no prior reading to compare against")

    try:
        text = llm.generate_annotation(
            display=obs.loinc_display or obs.raw_name, unit=obs.unit,
            prev_value=prev.value, curr_value=obs.value,
            prev_date=str(prev.observed_at), curr_date=str(obs.observed_at),
            flag=obs.flag, prev_flag=prev.flag,
        )
    except llm.AnnotationUnavailable as exc:
        # Never a 500 -- a missing key or a failed API call is an expected,
        # handled state the frontend falls back to its own canned text for.
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    obs.llm_annotation = text
    db.commit()
    return schemas.AnnotationOut(text=text, cached=False)
