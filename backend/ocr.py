"""OCR / document recognition abstraction layer.

Two independent parsers:
  - parse_azzeramento : reads the daily close report (AZZERAMENTO / chiusura)
  - parse_reparti     : reads the department sales report (VENDUTO PER REPARTO)

Speed strategy: a FAST vision model is tried first; if the result fails
validation (low confidence, missing total, missing/invalid lines, or an
inconsistent printed total) we fall back to the reliable PRO model.
Reliability is never sacrificed for speed.

The provider (Gemini vision via the Emergent universal key) is isolated here so
it can be swapped without touching the rest of the app. Both parsers return
structured data; mapping OCR labels -> configured RegisterColumn happens in a
separate layer (server.py). Photos are never persisted."""
import os
import json
import time
import uuid
import logging
from typing import List

from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

from money import parse_amount_to_cents

load_dotenv()
logger = logging.getLogger(__name__)

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
FAST_MODEL = ("gemini", "gemini-3-flash-preview")      # fast first attempt
PRO_MODEL = ("gemini", "gemini-3.1-pro-preview")       # reliable fallback
MIN_CONFIDENCE = 0.6


class OCRError(Exception):
    pass


def _strip_data_url(b64: str) -> str:
    if "," in b64 and b64.strip().startswith("data:"):
        return b64.split(",", 1)[1]
    return b64


def _extract_json(text: str) -> dict:
    t = text.strip()
    if "```" in t:
        for p in t.split("```"):
            p2 = p.strip()
            if p2.startswith("json"):
                p2 = p2[4:].strip()
            if p2.startswith("{"):
                t = p2
                break
    start = t.find("{")
    end = t.rfind("}")
    if start == -1 or end == -1:
        raise OCRError(f"No JSON object in model output: {text[:300]}")
    return json.loads(t[start:end + 1])


async def _run_vision(model, system_message: str, prompt: str, image_base64: str) -> str:
    if not EMERGENT_LLM_KEY:
        raise OCRError("EMERGENT_LLM_KEY mancante nel backend/.env")
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"ocr-{uuid.uuid4()}",
        system_message=system_message,
    ).with_model(*model)
    image = ImageContent(image_base64=_strip_data_url(image_base64))
    resp = await chat.send_message(UserMessage(text=prompt, file_contents=[image]))
    return resp if isinstance(resp, str) else str(resp)


# --------------------------------------------------------------------------- #
# AZZERAMENTO (daily close)                                                    #
# --------------------------------------------------------------------------- #
def _azz_system():
    return (
        "Sei un sistema OCR specializzato nella lettura di scontrini e documenti di "
        "chiusura giornaliera (azzeramento) di registratori di cassa italiani. "
        "L'immagine puo' essere ruotata, storta o a basso contrasto: correggi "
        "mentalmente l'orientamento prima di leggere. Rispondi SOLO con JSON valido."
    )


def _azz_prompt(total_aliases: List[str]) -> str:
    aliases_txt = "\n".join(f'- "{a}"' for a in total_aliases if a) or '- "TOTALE CORRISPETTIVI"'
    return f"""Leggi questo documento di AZZERAMENTO / chiusura giornaliera.

Devi trovare UN SOLO valore: il TOTALE DEI CORRISPETTIVI DEL GIORNO.
Le diciture possibili (alias) per questo totale sono:
{aliases_txt}

ATTENZIONE CRITICA:
- Sullo stesso documento possono esserci altri totali come "TOT. CUMULATIVO CORR.",
  "TOTALE CUMULATIVO", "GRAN TOTALE", "PROGRESSIVO". Questi NON sono il totale giornaliero
  e NON devono MAI essere restituiti.
- Restituisci solo l'importo associato alla dicitura del totale corrispettivi del GIORNO.
- Non inventare valori: se non trovi il totale giornaliero metti total_daily_receipts a null.

Leggi anche la data del documento se presente (data operativa / data di chiusura).

Rispondi esattamente con questo JSON:
{{
  "date": "YYYY-MM-DD oppure null",
  "total_daily_receipts": "importo come stringa esattamente come stampato, es '2757.40', oppure null",
  "matched_label": "la dicitura esatta trovata sul documento accanto all'importo, oppure null",
  "confidence": 0.0,
  "raw_text": "tutto il testo che hai letto dal documento"
}}"""


def _azz_from_raw(raw: str) -> dict:
    data = _extract_json(raw)
    return {
        "date": data.get("date") if data.get("date") not in ("null", "", None) else None,
        "total_daily_receipts_cents": parse_amount_to_cents(data.get("total_daily_receipts")),
        "total_raw": data.get("total_daily_receipts"),
        "matched_label": data.get("matched_label"),
        "confidence": float(data.get("confidence") or 0.0),
        "raw_text": data.get("raw_text", ""),
    }


def _valid_azz(d: dict) -> bool:
    return d.get("total_daily_receipts_cents") is not None and d.get("confidence", 0) >= MIN_CONFIDENCE


async def parse_azzeramento(image_base64: str, total_aliases: List[str]) -> dict:
    t0 = time.perf_counter()
    system, prompt = _azz_system(), _azz_prompt(total_aliases)
    data = _azz_from_raw(await _run_vision(FAST_MODEL, system, prompt, image_base64))
    data["model"] = FAST_MODEL[1]
    data["fallback"] = False
    if not _valid_azz(data):
        try:
            data2 = _azz_from_raw(await _run_vision(PRO_MODEL, system, prompt, image_base64))
            if _valid_azz(data2) or data.get("total_daily_receipts_cents") is None:
                data2["model"] = PRO_MODEL[1]
                data2["fallback"] = True
                data = data2
        except Exception:
            logger.exception("Azzeramento fallback failed")
    data["elapsed_ms"] = int((time.perf_counter() - t0) * 1000)
    return data


# --------------------------------------------------------------------------- #
# VENDUTO PER REPARTO (department sales)                                       #
# --------------------------------------------------------------------------- #
def _rep_system():
    return (
        "Sei un sistema OCR specializzato nella lettura dei documenti 'VENDUTO PER "
        "REPARTO' / scarico reparti dei registratori di cassa italiani. L'immagine puo' "
        "essere ruotata o storta: correggi l'orientamento prima di leggere. "
        "Rispondi SOLO con JSON valido."
    )


_REP_PROMPT = """Leggi questo documento VENDUTO PER REPARTO (scarico reparti).

Il documento contiene righe del tipo:
  DESCRIZIONE REPARTO      IMPORTO
es:
  RISTORANTE        2353.40
  BAR                201.90
  ALIMENTARI 22       80.05
e in fondo un totale tipo "TOT EUR: 2757.40".

Devi:
1. leggere OGNI riga di reparto con la sua descrizione e il suo importo;
2. riportare la descrizione ESATTAMENTE come stampata (serve per il mapping);
3. leggere il totale stampato (TOT EUR) se presente.

Non interpretare liberamente: riporta solo cio' che e' stampato. Non inventare righe.

Rispondi esattamente con questo JSON:
{
  "date": "YYYY-MM-DD oppure null",
  "lines": [
    {"label": "descrizione esatta", "amount": "importo come stringa es '2353.40'", "confidence": 0.0}
  ],
  "printed_total": "importo del TOT EUR come stringa, oppure null",
  "confidence": 0.0,
  "raw_text": "tutto il testo letto"
}"""


def _rep_from_raw(raw: str) -> dict:
    data = _extract_json(raw)
    lines = []
    for ln in data.get("lines", []) or []:
        lines.append({
            "label": (ln.get("label") or "").strip(),
            "amount_raw": ln.get("amount"),
            "amount_cents": parse_amount_to_cents(ln.get("amount")),
            "confidence": float(ln.get("confidence") or 0.0),
        })
    lines_sum = sum(l["amount_cents"] for l in lines if l.get("amount_cents") is not None)
    return {
        "date": data.get("date") if data.get("date") not in ("null", "", None) else None,
        "lines": lines,
        "printed_total_cents": parse_amount_to_cents(data.get("printed_total")),
        "printed_total_raw": data.get("printed_total"),
        "lines_sum_cents": lines_sum,
        "confidence": float(data.get("confidence") or 0.0),
        "raw_text": data.get("raw_text", ""),
    }


def _valid_rep(d: dict) -> bool:
    lines = d.get("lines") or []
    if not lines:
        return False
    if any(l.get("amount_cents") is None for l in lines):
        return False
    if d.get("confidence", 0) < MIN_CONFIDENCE:
        return False
    pt, ls = d.get("printed_total_cents"), d.get("lines_sum_cents")
    if pt is not None and ls is not None and pt != ls:
        return False
    return True


async def parse_reparti(image_base64: str) -> dict:
    t0 = time.perf_counter()
    system = _rep_system()
    data = _rep_from_raw(await _run_vision(FAST_MODEL, system, _REP_PROMPT, image_base64))
    data["model"] = FAST_MODEL[1]
    data["fallback"] = False
    if not _valid_rep(data):
        try:
            data2 = _rep_from_raw(await _run_vision(PRO_MODEL, system, _REP_PROMPT, image_base64))
            if _valid_rep(data2) or not data.get("lines"):
                data2["model"] = PRO_MODEL[1]
                data2["fallback"] = True
                data = data2
        except Exception:
            logger.exception("Reparti fallback failed")
    data["elapsed_ms"] = int((time.perf_counter() - t0) * 1000)
    return data
