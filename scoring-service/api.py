"""
Servicio HTTP mínimo sobre el motor de scoring.

Envuelve el pipeline existente (data_loader → score_calculator → tier_classifier)
y lo expone como una API que la app de Palomma Protect dispara. No reimplementa
el modelo: reutiliza el código del dev tal cual.

Correr:
    cd scoring-service
    uv sync
    cp .env.example .env   # y pega tu TINYBIRD_TOKEN
    uv run uvicorn api:app --host 127.0.0.1 --port 8000
"""

import json
import math
import os

from fastapi import FastAPI, Header, HTTPException

from scoring.merchant.data_loader import TinybirdDataLoader, load_data_for_merchant
from scoring.merchant.score_calculator import CustomerScoreCalculator
from scoring.merchant.tier_classifier import TierClassifier


def _safe_json(v):
    if isinstance(v, dict):
        return v
    try:
        return json.loads(v) if v else {}
    except Exception:  # noqa: BLE001
        return {}

app = FastAPI(title="Palomma Scoring Service", version="0.1.0")

# Clave opcional de servicio: si SERVICE_KEY está seteada, se exige el header.
SERVICE_KEY = os.getenv("SERVICE_KEY", "")


def _clean(v):
    """Hace el valor seguro para JSON (numpy → nativo, NaN/Inf → None)."""
    if v is None:
        return None
    if hasattr(v, "item"):  # escalares numpy
        v = v.item()
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    return v


@app.get("/health")
def health():
    return {"ok": True, "service": "palomma-scoring"}


@app.get("/merchant/{merchant_id}")
def merchant(merchant_id: str, x_service_key: str = Header(default="")):
    """Datos del merchant (rentals_merchants) para auto-llenar la inmobiliaria."""
    if SERVICE_KEY and x_service_key != SERVICE_KEY:
        raise HTTPException(status_code=401, detail="Service key inválida")
    try:
        loader = TinybirdDataLoader()
        m = merchant_id.replace("'", "''")
        df = loader._query(
            "SELECT id, displayName, supportEmail, billingInfo, legalRepresentative "
            f"FROM rentals_merchants WHERE id = '{m}' AND is_deleted = 0 LIMIT 1"
        )
        if df.empty:
            raise HTTPException(status_code=404, detail="Merchant no encontrado")
        row = df.iloc[0].to_dict()
        bi = _safe_json(row.get("billingInfo"))
        lr = _safe_json(row.get("legalRepresentative"))
        return {
            "merchant_id": row.get("id"),
            "razon_social": bi.get("name") or row.get("displayName"),
            "nit": bi.get("documentNumber"),
            "ciudad": bi.get("city"),
            "direccion": bi.get("address"),
            "telefono": bi.get("phoneNumber"),
            "email_contacto": row.get("supportEmail"),
            "representante_legal": lr.get("name"),
            "cc_representante": lr.get("documentNumber"),
        }
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/score/{merchant_id}")
def score(merchant_id: str, x_service_key: str = Header(default="")):
    if SERVICE_KEY and x_service_key != SERVICE_KEY:
        raise HTTPException(status_code=401, detail="Service key inválida")

    try:
        invoices_df, customers_df = load_data_for_merchant(merchant_id)

        calculator = CustomerScoreCalculator(invoices_df)
        scores_df = calculator.calculate_scores_for_all_customers()
        scores_df = TierClassifier.add_tier_and_recommendations(scores_df)

        # Une nombre/email/teléfono (rentals_customers) por número de documento.
        if customers_df is not None and not customers_df.empty:
            meta = (
                customers_df.rename(columns={"documentNumber": "customer_document_number"})[
                    ["customer_document_number", "name", "email", "phoneNumber"]
                ]
                .drop_duplicates("customer_document_number")
            )
            scores_df["customer_document_number"] = scores_df[
                "customer_document_number"
            ].astype(str)
            meta["customer_document_number"] = meta["customer_document_number"].astype(str)
            scores_df = scores_df.merge(meta, on="customer_document_number", how="left")

        records = [
            {k: _clean(v) for k, v in row.items()}
            for row in scores_df.to_dict(orient="records")
        ]
        return {"merchant_id": merchant_id, "count": len(records), "scores": records}
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e)) from e
