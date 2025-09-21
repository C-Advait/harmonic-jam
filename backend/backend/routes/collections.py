import uuid

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
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


@router.post("/addCompaniesToCollection")
def add_companies_to_collection(
    request: AddCompaniesToCollectionRequest,
    db: Session = Depends(database.get_db),
):
    # Check if collection exists
    collection = db.query(database.CompanyCollection).filter(
        database.CompanyCollection.id == request.collection_id
    ).first()
    
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    
    # Check if companies exist
    existing_companies = db.query(database.Company).filter(
        database.Company.id.in_(request.company_ids)
    ).all()
    
    if len(existing_companies) != len(request.company_ids):
        raise HTTPException(status_code=404, detail="One or more companies not found")
    
    # Add companies to collection (avoid duplicates)
    added_count = 0
    for company_id in request.company_ids:
        existing_association = db.query(database.CompanyCollectionAssociation).filter(
            database.CompanyCollectionAssociation.company_id == company_id,
            database.CompanyCollectionAssociation.collection_id == request.collection_id
        ).first()
        
        if not existing_association:
            association = database.CompanyCollectionAssociation(
                company_id=company_id,
                collection_id=request.collection_id
            )
            db.add(association)
            added_count += 1
    
    db.commit()
    
    return {
        "message": f"Successfully added {added_count} companies to collection",
        "collection_id": request.collection_id,
        "added_count": added_count
    }