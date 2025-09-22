import uuid
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, Query, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from backend.db import database
from backend.routes.companies import (
    CompanyBatchOutput,
    fetch_companies_with_liked,
)

router = APIRouter(
    prefix="/collections",
    tags=["collections"],
)


class CompanyCollectionMetadata(BaseModel):
    id: uuid.UUID
    collection_name: str


class CompanyCollectionOutput(CompanyBatchOutput, CompanyCollectionMetadata):
    pass


@router.get("", response_model=list[CompanyCollectionMetadata])
def get_all_collection_metadata(
    db: Session = Depends(database.get_db),
):
    collections = db.query(database.CompanyCollection).all()

    return [
        CompanyCollectionMetadata(
            id=collection.id,
            collection_name=collection.collection_name,
        )
        for collection in collections
    ]


@router.get("/{collection_id}", response_model=CompanyCollectionOutput)
def get_company_collection_by_id(
    collection_id: uuid.UUID,
    offset: int = Query(
        0, description="The number of items to skip from the beginning"
    ),
    limit: int = Query(10, description="The number of items to fetch"),
    db: Session = Depends(database.get_db),
):
    query = (
        db.query(database.CompanyCollectionAssociation, database.Company)
        .join(database.Company)
        .filter(database.CompanyCollectionAssociation.collection_id == collection_id)
    )

    total_count = query.with_entities(func.count()).scalar()

    results = query.offset(offset).limit(limit).all()
    companies = fetch_companies_with_liked(db, [company.id for _, company in results])

    return CompanyCollectionOutput(
        id=collection_id,
        collection_name=db.query(database.CompanyCollection)
        .get(collection_id)
        .collection_name,
        companies=companies,
        total=total_count,
    )

class AddCompaniesToCollectionRequest(BaseModel):
    collection_id: uuid.UUID
    company_ids: list[int]

# In-memory storage for transfer jobs
transfer_jobs = {}

class TransferCompaniesRequest(BaseModel):
    target_collection_id: uuid.UUID
    company_ids: Optional[list[int]] = None
    transfer_all: bool = False

class TransferStatusResponse(BaseModel):
    job_id: str
    status: str  # "pending", "in_progress", "completed", "failed"
    progress: int
    total: int
    message: str
    started_at: datetime
    completed_at: Optional[datetime] = None

def process_transfer_in_background(job_id: str, source_collection_id: uuid.UUID,
                                   target_collection_id: uuid.UUID,
                                   company_ids: list[int], db_session: Session):
    """Background task to process company transfers in batches"""
    try:
        batch_size = 20
        total_companies = len(company_ids)
        added_count = 0
        processed_count = 0

        # Update job status
        transfer_jobs[job_id]["status"] = "in_progress"
        transfer_jobs[job_id]["total"] = total_companies

        # Get all the associations that already exist for the request
        # Once at the start of the request
        existing_associations = db_session.query(
            database.CompanyCollectionAssociation.company_id
        ).filter(
            database.CompanyCollectionAssociation.collection_id == target_collection_id,
        ).all()

        # Extract company IDs from the query result tuples
        existing_company_ids = [row[0] for row in existing_associations]

        # Update progress to show existing associations as completed
        added_count += len(existing_company_ids)
        processed_count += added_count

        # Get all the new associations to insert once at the start of the request
        new_company_associations_to_insert = list(set(company_ids) - set(existing_company_ids))

        for i in range(0, len(new_company_associations_to_insert), batch_size):
            batch = new_company_associations_to_insert[i:i+batch_size]

            # Create a raw SQL statement for bulk insert with conflict handling
            # Build VALUES clause for batch insert
            values_clause = ", ".join([f"({company_id}, '{target_collection_id}')" for company_id in batch])
            
            # ON CONFLICT DO NOTHING to honour unique constraint
            sql = text(f"""
INSERT INTO company_collection_associations (company_id, collection_id)
VALUES {values_clause}
ON CONFLICT DO NOTHING
            """)
            
            db_session.execute(sql)
            
            db_session.commit()
            added_count += len(batch) 
            processed_count += len(batch)

            # Update progress
            transfer_jobs[job_id]["progress"] = processed_count
            transfer_jobs[job_id]["message"] = f"Processed {processed_count}/{total_companies} companies"

        # Mark as completed
        transfer_jobs[job_id]["status"] = "completed"
        transfer_jobs[job_id]["progress"] = total_companies
        transfer_jobs[job_id]["message"] = f"Successfully transferred {added_count} new companies ({total_companies - added_count} already existed)"
        transfer_jobs[job_id]["completed_at"] = datetime.utcnow()

    except Exception as e:
        # Mark as failed
        transfer_jobs[job_id]["status"] = "failed"
        transfer_jobs[job_id]["message"] = f"Transfer failed: {str(e)}"
        transfer_jobs[job_id]["completed_at"] = datetime.utcnow()
    finally:
        db_session.close()

@router.post("/{source_collection_id}/transfer")
def transfer_companies(
    source_collection_id: uuid.UUID,
    request: TransferCompaniesRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(database.get_db),
):
    """Start a company transfer operation from source to target collection"""

    # Validate collections exist
    source_collection = db.query(database.CompanyCollection).filter(
        database.CompanyCollection.id == source_collection_id
    ).first()

    target_collection = db.query(database.CompanyCollection).filter(
        database.CompanyCollection.id == request.target_collection_id
    ).first()

    if not source_collection:
        raise HTTPException(status_code=404, detail="Source collection not found")
    if not target_collection:
        raise HTTPException(status_code=404, detail="Target collection not found")

    # Get company IDs to transfer
    if request.transfer_all:
        # Get all company IDs from source collection
        company_ids = [
            assoc.company_id for assoc in
            db.query(database.CompanyCollectionAssociation).filter(
                database.CompanyCollectionAssociation.collection_id == source_collection_id
            ).all()
        ]
    else:
        if not request.company_ids:
            raise HTTPException(status_code=400, detail="Must provide company_ids or set transfer_all=true")
        company_ids = request.company_ids

        # Verify companies exist in source collection
        existing_associations = db.query(database.CompanyCollectionAssociation).filter(
            database.CompanyCollectionAssociation.collection_id == source_collection_id,
            database.CompanyCollectionAssociation.company_id.in_(company_ids)
        ).all()

        existing_company_ids = [assoc.company_id for assoc in existing_associations]
        if len(existing_company_ids) != len(company_ids):
            missing = set(company_ids) - set(existing_company_ids)
            raise HTTPException(status_code=404, detail=f"Companies not found in source collection: {list(missing)}")

    if not company_ids:
        raise HTTPException(status_code=400, detail="No companies to transfer")

    # Create job
    job_id = str(uuid.uuid4())
    transfer_jobs[job_id] = {
        "job_id": job_id,
        "status": "pending",
        "progress": 0,
        "total": len(company_ids),
        "message": "Transfer started",
        "started_at": datetime.utcnow(),
        "completed_at": None
    }

    # Create new database session for background task
    background_db = database.SessionLocal()

    # Start background processing
    background_tasks.add_task(
        process_transfer_in_background,
        job_id,
        source_collection_id,
        request.target_collection_id,
        company_ids,
        background_db
    )

    return {
        "job_id": job_id,
        "message": f"Transfer started for {len(company_ids)} companies",
        "total_companies": len(company_ids)
    }

@router.get("/transfer-status/{job_id}")
def get_transfer_status(job_id: str) -> TransferStatusResponse:
    """Get the status of a transfer operation"""

    if job_id not in transfer_jobs:
        raise HTTPException(status_code=404, detail="Transfer job not found")

    job_data = transfer_jobs[job_id]

    return TransferStatusResponse(
        job_id=job_data["job_id"],
        status=job_data["status"],
        progress=job_data["progress"],
        total=job_data["total"],
        message=job_data["message"],
        started_at=job_data["started_at"],
        completed_at=job_data["completed_at"]
    )