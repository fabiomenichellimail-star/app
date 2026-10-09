# Registro Corrispettivi — App Android OFFLINE (Expo / React Native)

App nativa **100% offline**. Dopo l'installazione dell'APK **non serve Internet** per nessuna
funzione (OCR, salvataggio, quadratura, PDF, Excel, backup). Nessun backend, nessun MongoDB,
nessun Gemini, nessuna API key.

> Versione web stabile invariata: tag `corrispettivi-mvp-stable` NON toccato.

## Stack
- Expo SDK 57 / React Native (app nativa, **non** WebView) → APK via EAS.
- OCR on-device: **Google ML Kit Text Recognition** (`@react-native-ml-kit/text-recognition`),
  artifact **bundled** `com.google.mlkit:text-recognition` → modello incluso nell'APK,
  **nessun download a runtime**. Nessun `play-services-mlkit` (verificato).
- DB locale: **expo-sqlite** (`corrispettivi.db` nello storage privato app).
- PDF: **expo-print** (HTML→PDF A4 landscape reale) + **expo-sharing** (condividi/stampa).
- Excel: **SheetJS (xlsx)** → `.xlsx` reale con celle numeriche, scritto con `expo-file-system`.
- Backup: JSON versionato (`schema_version`), export/import con `expo-document-picker`.
- Fotocamera: **expo-camera** con riquadro + crop locale (`expo-image-manipulator`). Foto NON conservate.

## Permessi Android
- `CAMERA` (cattura scontrini).
- `INTERNET` **bloccato** (`blockedPermissions`) → l'app non può nemmeno usare la rete.

## Struttura
```
mobile/
  app.json        # nome, package com.corrispettivi.registro, permessi, plugin
  eas.json        # profilo "preview" => buildType apk
  App.tsx         # navigazione + init DB
  src/
    db.ts         # SQLite: registers, register_columns, daily_entries, z_reports, daily_entry_values
    ocr.ts        # ML Kit (bundled, offline)
    image.ts      # crop + resize + cleanup temporaneo
    lib/          # money, parsers (azzeramento/reparti), reconciliation, util  (logica validata, portata dal web)
    files/        # pdf.ts, xlsx.ts, backup.ts
    screens/      # Home, CreateRegister, Register, NewDay
    components/   # ui, CameraCapture
    __tests__/logic.test.ts   # 29 test logica (centesimi, parser, mapping, quadratura, multi-azz)
```

## Test logica (eseguibile qui, senza device)
```
cd mobile && npx tsx src/__tests__/logic.test.ts   # => 29 PASS / 0 FAIL
npx tsc --noEmit                                    # => 0 errori
```

## Build APK (da fare dall'utente via Emergent)
1. Pannello **Publish → Mobile → Android** (EAS build, ~10–20 min), profilo `preview` (APK).
   In alternativa CLI: `npx eas login && npx eas build:configure && npx expo prebuild --clean && npx eas build -p android --profile preview`.
2. Scarica l'APK e installalo sul telefono.

## COLLAUDO OBBLIGATORIO — Modalità aereo (APK appena installato)
Esegui SENZA aver mai aperto l'app con Internet:
1. Attiva modalità aereo (no Wi‑Fi, no dati, no VPN).
2. Installa l'APK e aprilo per la prima volta.
3. Crea registro + colonne → Fotografa azzeramento → **OCR locale** legge il totale giorno
   (NON il cumulativo) → Fotografa reparti → OCR + mapping alias → Quadratura (diff 0 = VERIFICATO).
4. Salva giornata → chiudi app → riapri (sempre offline) → dati presenti.
5. Multi-azzeramento (500,00 + 365,58 = 865,58, UNA riga) → PDF → XLSX → Backup/Ripristino.
Se un passo richiede rete, la build NON è offline (criterio di accettazione).

### Verifica tecnica bundled (già confermata in dev)
```
grep -R "com.google.mlkit:text-recognition" node_modules/@react-native-ml-kit/text-recognition/android/build.gradle   # presente
grep -R "play-services-mlkit-text-recognition" node_modules/@react-native-ml-kit/text-recognition/android              # ASSENTE
# dopo prebuild, sul merged manifest NON deve comparire android.permission.INTERNET
```

## Note
- La UI nativa non è testabile nell'ambiente di sviluppo (serve device/emulatore Android):
  la logica offline è verificata via Node (29/29) e il typecheck è pulito.
- Configurazione colonne dopo la creazione: prevista in un incremento successivo (ora le colonne
  si impostano alla creazione e si duplicano con "Duplica registro").
- Migrazione dati dalla versione web: tramite "Esporta backup (JSON)" (da aggiungere alla web) →
  "Importa / ripristina backup" nell'app Android.
