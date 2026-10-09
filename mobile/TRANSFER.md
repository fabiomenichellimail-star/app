# Trasferimento al nuovo job "Mobile App" di Emergent

Progetto Expo/React Native **standalone** e **100% offline**. Root del progetto = questa cartella (`mobile/`).
Nessuna dipendenza dal progetto Web padre, nessuna chiamata di rete.

- App: **Registro Corrispettivi**
- Android package: `it.dagiovannino.registrocorrispettivi`
- Expo SDK 57 · OCR Google ML Kit (bundled, on-device) · SQLite locale · PDF (expo-print) · XLSX (SheetJS)
- `INTERNET` è in `blockedPermissions` → l'app non può usare la rete.

## 1. Importare nel nuovo job Mobile
1. Su Emergent crea un **nuovo job** e scegli tipo **Mobile App** (il tipo non è convertibile dopo).
2. Porta dentro questo codice: la root del progetto Expo è il contenuto di questa cartella `mobile/`.
   Se importi da GitHub un repo che contiene l'intero progetto, indica `mobile/` come cartella radice dell'app Expo.

## 2. Comandi / check iniziali
```bash
npx expo install --fix     # allinea le versioni dei pacchetti all'SDK
npx expo-doctor            # diagnosi config/dipendenze
```

## 3. Verifica TypeScript + logica
```bash
npx tsc --noEmit                        # 0 errori
npx tsx src/__tests__/logic.test.ts     # 32 PASS / 0 FAIL
```

## 4. Build Android Preview (APK)
- Via Emergent: **Publish → Android** (profilo `preview`, EAS, ~10–20 min).
- Via CLI:
```bash
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview
```
Scarica l'APK e installalo sul telefono.

## 5. Collaudo in modalità aereo (APK appena installato)
1. Attiva **modalità aereo** (no Wi‑Fi, no dati, no VPN) PRIMA di aprire l'app.
2. Installa e apri l'APK per la prima volta.
3. Crea registro + colonne → fotografa **azzeramento** → OCR locale legge il totale giorno.
4. Fotografa **reparti** → OCR + mapping alias → **quadratura** (diff 0 = VERIFICATO).
5. Salva giornata → chiudi e riapri (offline) → dati presenti.
6. Multi-azzeramento (es. 500,00 + 365,58 = 865,58, una sola riga) → PDF → XLSX → Backup/Ripristino.

Se un passo richiede rete, la build NON è offline (criterio di accettazione non superato).
