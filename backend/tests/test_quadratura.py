"""Zero-tolerance quadratura API tests.
Covers:
- POST /api/registers (create temp register with 1 included column)
- POST /api/registers/{id}/entries for diff 0, +1, -1 cents
- Acceptance test with 6 reparti
- POST /api/registers/{id}/ocr/reparti with /app/test_assets/reparti.jpg
"""
import base64
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://register-ocr.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def temp_register(api_client):
    payload = {
        "name": "TEST_QUADRATURA",
        "business_name": "TEST",
        "year": 2026,
        "columns": [
            {"display_name": "Reparto", "ocr_label": "REPARTO",
             "aliases": [], "include_in_reconciliation": True, "active": True}
        ],
    }
    r = api_client.post(f"{API}/registers", json=payload)
    assert r.status_code == 200, r.text
    reg_id = r.json()["id"]
    # fetch to get column id
    r2 = api_client.get(f"{API}/registers/{reg_id}")
    assert r2.status_code == 200
    cols = r2.json()["columns"]
    assert len(cols) == 1
    col_id = cols[0]["id"]
    yield {"id": reg_id, "col_id": col_id}
    api_client.delete(f"{API}/registers/{reg_id}")


@pytest.fixture(scope="module")
def temp_register_6cols(api_client):
    payload = {
        "name": "TEST_QUADRATURA_6",
        "business_name": "TEST",
        "year": 2026,
        "columns": [
            {"display_name": "Ristorante", "ocr_label": "RISTORANTE", "aliases": [], "include_in_reconciliation": True, "active": True},
            {"display_name": "Bar", "ocr_label": "BAR", "aliases": [], "include_in_reconciliation": True, "active": True},
            {"display_name": "Alim22", "ocr_label": "ALIMENTARI 22", "aliases": [], "include_in_reconciliation": True, "active": True},
            {"display_name": "Alim10", "ocr_label": "ALIMENTARI 10", "aliases": [], "include_in_reconciliation": True, "active": True},
            {"display_name": "Bombole", "ocr_label": "BOMBOLE", "aliases": [], "include_in_reconciliation": True, "active": True},
            {"display_name": "Alim4", "ocr_label": "ALIMENTARI 4", "aliases": [], "include_in_reconciliation": True, "active": True},
        ],
    }
    r = api_client.post(f"{API}/registers", json=payload)
    assert r.status_code == 200, r.text
    reg_id = r.json()["id"]
    r2 = api_client.get(f"{API}/registers/{reg_id}")
    cols = r2.json()["columns"]
    name_to_id = {c["display_name"]: c["id"] for c in cols}
    yield {"id": reg_id, "cols": name_to_id}
    api_client.delete(f"{API}/registers/{reg_id}")


# --- Zero-tolerance quadratura cases ---------------------------------------- #

def test_quadratura_diff_zero_verificato(api_client, temp_register):
    reg_id, col_id = temp_register["id"], temp_register["col_id"]
    payload = {
        "business_date": "2026-01-02",
        "total_receipts_cents": 275740,
        "values": {col_id: 275740},
    }
    r = api_client.post(f"{API}/registers/{reg_id}/entries", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["departments_total_cents"] == 275740
    assert data["difference_cents"] == 0
    assert data["reconciliation_status"] == "VERIFICATO"
    assert isinstance(data["difference_cents"], int)
    assert isinstance(data["departments_total_cents"], int)


def test_quadratura_diff_plus_one_non_quadrato(api_client, temp_register):
    reg_id, col_id = temp_register["id"], temp_register["col_id"]
    payload = {
        "business_date": "2026-01-03",
        "total_receipts_cents": 275740,
        "values": {col_id: 275739},
    }
    r = api_client.post(f"{API}/registers/{reg_id}/entries", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["departments_total_cents"] == 275739
    assert data["difference_cents"] == 1
    assert data["reconciliation_status"] == "NON_QUADRATO"
    assert isinstance(data["difference_cents"], int)


def test_quadratura_diff_minus_one_non_quadrato(api_client, temp_register):
    reg_id, col_id = temp_register["id"], temp_register["col_id"]
    payload = {
        "business_date": "2026-01-04",
        "total_receipts_cents": 275740,
        "values": {col_id: 275741},
    }
    r = api_client.post(f"{API}/registers/{reg_id}/entries", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["departments_total_cents"] == 275741
    assert data["difference_cents"] == -1
    assert data["reconciliation_status"] == "NON_QUADRATO"
    assert isinstance(data["difference_cents"], int)


def test_quadratura_6_reparti_verificato(api_client, temp_register_6cols):
    reg_id = temp_register_6cols["id"]
    cmap = temp_register_6cols["cols"]
    values = {
        cmap["Ristorante"]: 235340,
        cmap["Bar"]: 20190,
        cmap["Alim22"]: 8005,
        cmap["Alim10"]: 4240,
        cmap["Bombole"]: 4100,
        cmap["Alim4"]: 3865,
    }
    assert sum(values.values()) == 275740
    payload = {
        "business_date": "2026-01-05",
        "total_receipts_cents": 275740,
        "values": values,
    }
    r = api_client.post(f"{API}/registers/{reg_id}/entries", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["departments_total_cents"] == 275740
    assert data["difference_cents"] == 0
    assert data["reconciliation_status"] == "VERIFICATO"


# --- OCR Controllo A --------------------------------------------------------- #

def test_ocr_reparti_controllo_a(api_client, temp_register_6cols):
    reg_id = temp_register_6cols["id"]
    img_path = "/app/test_assets/reparti.jpg"
    if not os.path.exists(img_path):
        pytest.skip("reparti.jpg not found")
    with open(img_path, "rb") as fh:
        b64 = base64.b64encode(fh.read()).decode()
    payload = {"image_base64": f"data:image/jpeg;base64,{b64}"}
    r = api_client.post(f"{API}/registers/{reg_id}/ocr/reparti", json=payload, timeout=120)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "lines_sum_cents" in data
    assert "printed_total_cents" in data
    lines_sum = data["lines_sum_cents"]
    printed = data["printed_total_cents"]
    assert isinstance(lines_sum, int), f"lines_sum_cents must be int, got {type(lines_sum)}"
    assert isinstance(printed, int), f"printed_total_cents must be int, got {type(printed)}"
    assert lines_sum == 275740, f"lines_sum_cents expected 275740, got {lines_sum}; lines={data.get('lines')}"
    assert printed == 275740, f"printed_total_cents expected 275740, got {printed}"
    assert printed - lines_sum == 0
