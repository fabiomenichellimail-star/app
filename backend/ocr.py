"""OCR / document recognition abstraction layer.

Two independent parsers:
  - parse_azzeramento : reads the daily close report (AZZERAMENTO / chiusura)
  - parse_reparti     : reads the department sales report (VENDUTO PER REPARTO)

The provider (currently Gemini vision via the Emergent universal key) is isolated
here so it can be swapped without touching the rest of the app. Both parsers return
structured data; mapping OCR labels -> configured RegisterColumn happens in a
separate layer (server.py)."""
import os
import json
import uuid
import logging
from typing import List, Optional

from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

from money import parse_amount_to_cents

load_dotenv()
logger = logging.getLogger(__name__)

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
OCR_MODEL = ("gemini", "gemini-3.1-pro-preview")


class OCRError(Exception):
    pass


def _strip_data_url(b64: str) -> str:
    if "," in b64 and b64.strip().startswith("data:"):
        return b64.split(",", 1)[1]
    return b64


def _extract_json(text: str) -> dict:
    t = text.strip()
    if "```" in t:
        # take content between first ``` and last ```
        parts = t.split("```")
        # find the chunk that looks like json
        for p in parts:
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


async def _run_vision(system_message: str, prompt: str, image_base64: str) -> str:
    if not EMERGENT_LLM_KEY:
        raise OCRError("EMERGENT_LLM_KEY mancante nel backend/.env")
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"ocr-{uuid.uuid4()}",
        system_message=system_message,
    ).with_model(*OCR_MODEL)
    image = ImageContent(image_base64=_strip_data_url(image_base64))
    msg = UserMessage(text=prompt, file_contents=[image])
    resp = await chat.send_message(msg)
    return resp if isinstance(resp, str) else str(resp)


# --------------------------------------------------------------------------- #
# AZZERAMENTO (daily close)                                                    #
# --------------------------------------------------------------------------- #
async def parse_azzeramento(image_base64: str, total_aliases: List[str]) -> dict:
    aliases_txt = "\n".join(f'- "{a}"' for a in total_aliases if a) or '- "TOTALE CORRISPETTIVI"'
    system = (
        "Sei un sistema OCR specializzato nella lettura di scontrini e documenti di "
        "chiusura giornaliera (azzeramento) di registratori di cassa italiani. "
        "L'immagine puo' essere ruotata, storta o a basso contrasto: correggi "
        "mentalmente l'orientamento prima di leggere. Rispondi SOLO con JSON valido."
    )
    prompt = f"""Leggi questo documento di AZZERAMENTO / chiusura giornaliera.

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
    raw = await _run_vision(system, prompt, image_base64)
    data = _extract_json(raw)
    return {
        "date": data.get("date") if data.get("date") not in ("null", "", None) else None,
        "total_daily_receipts_cents": parse_amount_to_cents(data.get("total_daily_receipts")),
        "total_raw": data.get("total_daily_receipts"),
        "matched_label": data.get("matched_label"),
        "confidence": float(data.get("confidence") or 0.0),
        "raw_text": data.get("raw_text", ""),
    }


# --------------------------------------------------------------------------- #
# VENDUTO PER REPARTO (department sales)                                       #
# --------------------------------------------------------------------------- #
async def parse_reparti(image_base64: str) -> dict:
    system = (
        "Sei un sistema OCR specializzato nella lettura dei documenti 'VENDUTO PER "
        "REPARTO' / scarico reparti dei registratori di cassa italiani. L'immagine puo' "
        "essere ruotata o storta: correggi l'orientamento prima di leggere. "
        "Rispondi SOLO con JSON valido."
    )
    prompt = """Leggi questo documento VENDUTO PER REPARTO (scarico reparti).

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
    raw = await _run_vision(system, prompt, image_base64)
    data = _extract_json(raw)
    lines = []
    for ln in data.get("lines", []) or []:
        lines.append({
            "label": (ln.get("label") or "").strip(),
            "amount_raw": ln.get("amount"),
            "amount_cents": parse_amount_to_cents(ln.get("amount")),
            "confidence": float(ln.get("confidence") or 0.0),
        })
    return {
        "date": data.get("date") if data.get("date") not in ("null", "", None) else None,
        "lines": lines,
        "printed_total_cents": parse_amount_to_cents(data.get("printed_total")),
        "printed_total_raw": data.get("printed_total"),
        "confidence": float(data.get("confidence") or 0.0),
        "raw_text": data.get("raw_text", ""),
    }
