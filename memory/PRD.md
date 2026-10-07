# REGISTRO CORRISPETTIVI — PRD

## Problema originale
App italiana mobile-first per compilare automaticamente il registro dei corrispettivi partendo da foto di due documenti del registratore di cassa: AZZERAMENTO (chiusura giornaliera) e VENDUTO PER REPARTO. OCR AI legge gli importi, li mappa alle colonne configurabili, esegue la quadratura, l'utente conferma e salva. Consultazione, modifica manuale, export Excel/PDF, registri multipli.

## Scelte utente
- OCR: AI Vision con Emergent Universal Key — modello **Gemini 3.1 Pro** (gemini-3.1-pro-preview)
- Nessuna autenticazione (uso singolo)
- Foto NON conservate (solo i dati letti) → requisito 13 "vedi foto originali" NON implementato per scelta utente
- Interfaccia italiana, mobile-first, pulsanti grandi

## Stack / Architettura
- Backend: FastAPI + MongoDB (motor). Importi in CENTESIMI INTERI (mai float).
- OCR astratto in `backend/ocr.py` (due parser distinti: azzeramento, reparti) via emergentintegrations.
- Mapping alias→colonna e quadratura in `backend/server.py`.
- Frontend: React (CRA/craco), Tailwind, shadcn/ui, sonner. Font Manrope + IBM Plex Sans.
- Collezioni Mongo: registers, columns, entries (uuid string id).

## Implementato (2026-06)
- FASE 1: Registri + colonne configurabili (prime due fisse Data/Totale) + inserimento manuale ✓
- FASE 2: Fotocamera/upload + OCR reale Gemini (gestione immagini ruotate) ✓
- FASE 3: Mapping reparti→colonne (alias, longest-match) + quadratura automatica (Controllo A TOT EUR, Controllo B azzeramento) ✓
- FASE 4: Archivio giornate, modifica manuale con ricalcolo, duplicati (409 + sostituisci/apri), eliminazione ✓
- FASE 5: Export PDF A4 landscape reale (reportlab) ✓
- FASE 6: Export Excel .xlsx reale (openpyxl, fogli Registro + Controlli, celle valuta) ✓
- FASE 7: UX rifinita + test completi (logica, e2e API, OCR reale, frontend 100%) ✓
- Registri multipli + duplica registro (colonne/alias/ordine, senza giornate) ✓
- Stati: VERIFICATO / NON_QUADRATO / DA_CONTROLLARE con icona+testo ✓
- Totali mensili + navigazione mesi ✓

## Test eseguiti
- Unit logica (`backend/test_logic.py`): parsing centesimi (punto/virgola/migliaia), mapping, quadratura corretta/errata.
- E2E API: creazione, acceptance test VERIFICATO (diff €0,00), 409 duplicato, replace, export xlsx/pdf (magic bytes), duplica registro.
- OCR reale: azzeramento ignora TOT. CUMULATIVO e prende il giornaliero; reparti letti da foto ruotata 12° e mappati.
- Frontend E2E (testing agent): 100% pass, nessun bug.

## Backlog / Prossimi (P1/P2)
- P1: Conservazione foto originali + "Vedi azzeramento / Vedi scarico reparti" (object storage) — escluso per scelta utente, riattivabile.
- P2: Assegnazione manuale righe non mappate direttamente dalla schermata di conferma.
- P2: Endpoint batch per salvataggio colonne (ora N chiamate sequenziali).
- P2: Export intero anno già disponibile via tab "Anno"; valutare export multi-foglio per mese.
