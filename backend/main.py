from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List
from model import predict_shortage_risk

app = FastAPI(title="PBSN Predictive Blood Shortage API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class PredictionInput(BaseModel):
    group: str = Field(..., examples=["O-"])
    region: str = Field(..., examples=["New Delhi"])
    currentInventory: float = Field(..., ge=0)
    historicalDailyDemand: float = Field(..., gt=0)
    expectedDailyDemand: float = Field(..., gt=0)
    periodDays: int = Field(7, ge=1, le=90)


class BloodRequestInput(BaseModel):
    refId: str
    group: str
    units: int = Field(..., ge=1, le=50)
    hospital: str
    city: str
    urgency: str


class InquiryInput(BaseModel):
    inquiryType: str
    subject: str
    group: str = "ALL"
    units: int = Field(0, ge=0, le=500)
    city: str
    contact: str
    notes: str = ""


DEMO_BANKS = [
    {"id": "aiims-delhi", "name": "AIIMS Main Blood Bank", "city": "New Delhi", "lat": 28.5672, "lng": 77.2100},
    {"id": "kem-mumbai", "name": "KEM Hospital Blood Centre", "city": "Mumbai", "lat": 19.0022, "lng": 72.8419},
    {"id": "manipal-blr", "name": "Manipal Hospital Blood Bank", "city": "Bengaluru", "lat": 12.9584, "lng": 77.6489},
    {"id": "apollo-chn", "name": "Apollo Hospitals Blood Centre", "city": "Chennai", "lat": 13.0631, "lng": 80.2516},
]
DEMO_REQUESTS: List[dict] = []
DEMO_INQUIRIES: List[dict] = []


@app.post("/api/predict-shortage")
def api_predict_shortage(payload: PredictionInput):
    return predict_shortage_risk(payload.model_dump())


@app.get("/api/inventory")
def api_inventory():
    return {"status": "demo", "banks": DEMO_BANKS}


@app.get("/api/blood-banks")
def api_blood_banks():
    return {"count": len(DEMO_BANKS), "blood_banks": DEMO_BANKS}


@app.post("/api/blood-requests")
def api_create_request(req: BloodRequestInput):
    entry = req.model_dump()
    DEMO_REQUESTS.insert(0, entry)
    return {"accepted": True, "request": entry}


@app.post("/api/inquiries")
def api_create_inquiry(inq: InquiryInput):
    entry = inq.model_dump()
    DEMO_INQUIRIES.insert(0, entry)
    return {"accepted": True, "inquiry": entry}


@app.get("/api/inquiries")
def api_list_inquiries():
    return {"count": len(DEMO_INQUIRIES), "inquiries": DEMO_INQUIRIES}
