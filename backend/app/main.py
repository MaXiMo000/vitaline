from __future__ import annotations

from fastapi import Depends, FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models, schemas
from .database import Base, engine, get_db
from .pipeline.extract import UnreadablePDFError
from .pipeline.observations import parse_document

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Vitaline API")

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/documents", response_model=schemas.DocumentOut, status_code=201)
async def upload_document(file: UploadFile, db: Session = Depends(get_db)):
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


@app.get("/documents", response_model=list[schemas.DocumentOut])
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


@app.get("/observations", response_model=list[schemas.ObservationOut])
def list_observations(loinc_code: str | None = None, db: Session = Depends(get_db)):
    query = select(models.Observation).order_by(models.Observation.observed_at)
    if loinc_code:
        query = query.where(models.Observation.loinc_code == loinc_code)
    return db.scalars(query).all()
