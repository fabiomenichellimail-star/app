import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { getRegister, getEntry, checkDuplicate, saveEntry } from "../db";
import { recognizeText } from "../ocr";
import { cropAndPrepare, deleteTemp } from "../image";
import { parseAzzeramento, parseReparti, mapLinesToColumns } from "../lib/parsers";
import { computeReconciliation, zreportsTotal } from "../lib/reconciliation";
import { formatCents, formatEuro, parseAmountToCents } from "../lib/money";
import { todayIso } from "../lib/util";
import { CameraCapture } from "../components/CameraCapture";
import { Btn, Card, MoneyInput, Field } from "../components/ui";
import { C } from "../theme";

const DEFAULT_ALIASES = ["TOT. CORRISPETTIVO GIORNO", "TOT CORRISPETTIVO GIORNO", "TOTALE CORRISPETTIVO GIORNO", "TOTALE CORRISPETTIVI", "CORRISPETTIVO GIORNO"];

export default function NewDayScreen({ navigation, route }: any) {
  const { registerId, entryId } = route.params;
  const editing = !!entryId;
  const [reg, setReg] = useState<any>(null);
  const [cols, setCols] = useState<any[]>([]);
  const [step, setStep] = useState<"intro" | "confirm">("intro");
  const [date, setDate] = useState(todayIso());
  const [zrs, setZrs] = useState<any[]>([]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [lowConf, setLowConf] = useState<Record<string, boolean>>({});
  const [printed, setPrinted] = useState<number | null>(null);
  const [unmatched, setUnmatched] = useState<any[]>([]);
  const [repDone, setRepDone] = useState(false);
  const [cam, setCam] = useState<null | "azz" | "rep">(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await getRegister(registerId);
    setReg(r); setCols(r?.columns || []);
    if (editing) {
      const e = await getEntry(entryId);
      if (e) {
        setDate(e.business_date);
        setZrs(e.z_reports.map((z: any) => ({ id: z.id, amountStr: z.amount_cents != null ? formatCents(z.amount_cents) : "", confidence: z.confidence, detected_date: z.detected_date })));
        const vs: any = {}; Object.entries(e.values || {}).forEach(([k, v]: any) => (vs[k] = v != null ? formatCents(v) : ""));
        setVals(vs); setPrinted(e.printed_total_cents ?? null); setStep("confirm");
      }
    }
  }, [registerId, entryId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const active = cols.filter((c) => c.active);

  const onCaptured = async (uri: string, w: number, h: number) => {
    const mode = cam; setCam(null); setBusy(true);
    let cropped: string | null = null;
    try {
      cropped = await cropAndPrepare(uri, w, h);
      const text = await recognizeText(cropped);
      if (mode === "azz") {
        const aliases = (reg?.total_aliases?.length ? reg.total_aliases : DEFAULT_ALIASES);
        const a = parseAzzeramento(text, aliases);
        setZrs((p) => [...p, { amountStr: a.totalCents != null ? formatCents(a.totalCents) : "", confidence: a.confidence, detected_date: a.matchedLabel ? date : null }]);
        if (a.totalCents == null) Alert.alert("Da controllare", "Totale azzeramento non riconosciuto. Inseriscilo a mano.");
      } else {
        const rep = parseReparti(text);
        const { values, mapping, unmatched } = mapLinesToColumns(rep.lines, cols as any);
        const vs = { ...vals }; const lc = { ...lowConf };
        mapping.forEach((m) => { if (m.amount_cents != null) vs[m.column_id] = formatCents(m.amount_cents); });
        setVals(vs); setLowConf(lc); setPrinted(rep.printedTotalCents); setUnmatched(unmatched); setRepDone(true);
        if (unmatched.length) Alert.alert("Righe non associate", `${unmatched.length} righe non hanno una colonna. Aggiungi gli alias o inserisci a mano.`);
      }
    } catch (e: any) {
      Alert.alert("Errore OCR", String(e?.message || e));
    } finally {
      await deleteTemp(uri); await deleteTemp(cropped); // photos are never kept
      setBusy(false);
    }
  };

  const zTotal = zrs.reduce((s, z) => s + (parseAmountToCents(z.amountStr) || 0), 0);
  const totalCents = zrs.length ? zTotal : null;
  const valuesCents: Record<string, number | null> = {};
  active.forEach((c) => (valuesCents[c.id] = parseAmountToCents(vals[c.id] ?? "")));
  const { departmentsTotal, difference, status } = computeReconciliation(cols as any, totalCents, valuesCents);
  const checkA = printed != null ? printed - departmentsTotal : null;

  const zPayload = () => zrs.map((z) => ({ id: z.id, amount_cents: parseAmountToCents(z.amountStr), detected_date: z.detected_date, confidence: z.confidence }));

  const persist = async (asId?: string, mergeExisting?: any) => {
    setBusy(true);
    try {
      if (mergeExisting) {
        await saveEntry(registerId, { id: mergeExisting.id, business_date: mergeExisting.business_date, z_reports: [...mergeExisting.z_reports, ...zPayload()], values: mergeExisting.values, printed_total_cents: mergeExisting.printed_total_cents });
        navigation.replace("NewDay", { registerId, entryId: mergeExisting.id });
        return;
      }
      await saveEntry(registerId, { id: asId, business_date: date, z_reports: zPayload(), values: valuesCents, printed_total_cents: printed });
      navigation.navigate("Register", { id: registerId });
    } finally { setBusy(false); }
  };

  const onSave = async () => {
    if (!date) return Alert.alert("Data", "Inserisci la data");
    const chk = await checkDuplicate(registerId, date);
    if (chk.exists && (!editing || chk.entry.id !== entryId)) {
      Alert.alert("Giornata già esistente", `Esiste già la giornata ${date}. Vuoi aggiungere questo azzeramento alla giornata esistente?`, [
        { text: "Annulla", style: "cancel" },
        { text: "Apri giornata", onPress: () => navigation.replace("NewDay", { registerId, entryId: chk.entry.id }) },
        { text: "Aggiungi azzeramento", onPress: () => persist(undefined, chk.entry) },
      ]);
      return;
    }
    persist(editing ? entryId : undefined);
  };

  if (!reg) return <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => (step === "confirm" && !editing ? setStep("intro") : navigation.goBack())}><Text style={st.back}>‹</Text></TouchableOpacity>
        <View><Text style={st.title}>{editing ? "Modifica giornata" : "Nuova giornata"}</Text><Text style={st.hsub}>{reg.name}</Text></View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        {step === "intro" && (
          <>
            <Card>
              <Text style={st.sect}>1. Azzeramenti {zrs.length ? `· ${zrs.length} letti` : ""}</Text>
              <Text style={st.p}>Fotografa la chiusura giornaliera. Puoi aggiungere più azzeramenti per lo stesso giorno.</Text>
              {zrs.length > 0 && <View style={st.box}>{zrs.map((z, i) => <Text key={i} style={st.boxRow}>Azzeramento {i + 1}: <Text style={{ fontWeight: "800" }}>{z.amountStr ? "€ " + z.amountStr : "—"}</Text></Text>)}<Text style={[st.boxRow, { fontWeight: "800", marginTop: 4 }]}>Totale {formatEuro(zTotal)}</Text></View>}
              <Btn title={zrs.length ? "＋ Aggiungi azzeramento" : "📷 Leggi azzeramento"} onPress={() => setCam("azz")} />
            </Card>
            <Card>
              <Text style={st.sect}>2. Venduto per reparto {repDone ? "· letto ✓" : ""}</Text>
              <Text style={st.p}>Fotografa lo scarico reparti: gli importi verranno associati alle colonne.</Text>
              <Btn title="📷 Leggi reparti" variant="outline" onPress={() => setCam("rep")} />
            </Card>
            <Btn title="Prosegui alla conferma" onPress={() => setStep("confirm")} style={{ marginTop: 4 }} />
            <Btn title="✎ Inserimento manuale" variant="ghost" onPress={() => setStep("confirm")} />
          </>
        )}

        {step === "confirm" && (
          <>
            <QuadraturaCard status={status} totalCents={totalCents} dept={departmentsTotal} diff={difference} printed={printed} checkA={checkA} />
            <Card>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                <Text style={st.sect}>Azzeramenti</Text><Text style={{ fontWeight: "800", color: C.ink }}>{formatEuro(zTotal)}</Text>
              </View>
              {zrs.length === 0 && <Text style={{ color: C.mute, marginBottom: 8 }}>Nessun azzeramento. Aggiungine uno.</Text>}
              {zrs.map((z, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
                  <View style={{ flex: 1 }}><MoneyInput label={`Azzeramento ${i + 1}`} valueStr={z.amountStr} warn={(z.confidence ?? 1) < 0.7} onChangeStr={(v: string) => setZrs((p) => p.map((x, j) => (j === i ? { ...x, amountStr: v } : x)))} /></View>
                  <TouchableOpacity onPress={() => setZrs((p) => p.filter((_, j) => j !== i))} style={{ padding: 10, marginBottom: 12 }}><Text style={{ color: C.red, fontSize: 18 }}>🗑</Text></TouchableOpacity>
                </View>
              ))}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}><Btn title="📷 Foto" variant="outline" onPress={() => setCam("azz")} /></View>
                <View style={{ flex: 1 }}><Btn title="＋ Manuale" variant="outline" onPress={() => setZrs((p) => [...p, { amountStr: "", confidence: 1, detected_date: date }])} /></View>
              </View>
            </Card>
            <Card><Field label="Data (AAAA-MM-GG)" value={date} onChangeText={setDate} placeholder="2026-08-12" /></Card>
            <Card>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                <Text style={st.sect}>Reparti / Colonne</Text>
                <TouchableOpacity onPress={() => setCam("rep")}><Text style={{ color: C.sub, fontWeight: "700" }}>📷 Leggi</Text></TouchableOpacity>
              </View>
              {active.length === 0 && <Text style={{ color: C.mute }}>Nessuna colonna configurata.</Text>}
              {active.map((c) => <MoneyInput key={c.id} label={c.display_name} valueStr={vals[c.id] ?? ""} warn={lowConf["col_" + c.id]} onChangeStr={(v: string) => setVals((p) => ({ ...p, [c.id]: v }))} />)}
            </Card>
            {unmatched.length > 0 && (
              <Card style={{ backgroundColor: C.amberBg, borderColor: "#FDE68A" }}>
                <Text style={{ fontWeight: "800", color: C.amber, marginBottom: 4 }}>⚠ Righe non associate</Text>
                {unmatched.map((u, i) => <Text key={i} style={{ color: C.amber }}>{u.label} — {formatEuro(u.amountCents)}</Text>)}
              </Card>
            )}
          </>
        )}
      </ScrollView>

      {step === "confirm" && <View style={st.footer}><Btn title={busy ? "Salvataggio…" : "Salva giornata"} onPress={onSave} disabled={busy} /></View>}

      <CameraCapture visible={cam !== null} title={cam === "rep" ? "Leggi reparti" : "Leggi azzeramento"} onCancel={() => setCam(null)} onCaptured={onCaptured} />

      {busy && cam === null && (
        <View style={st.loading}><ActivityIndicator color="#fff" size="large" /><Text style={{ color: "#fff", fontWeight: "700", marginTop: 10 }}>Lettura in corso…</Text></View>
      )}
    </SafeAreaView>
  );
}

function QuadraturaCard({ status, totalCents, dept, diff, printed, checkA }: any) {
  const cfg: any = ({
    VERIFICATO: { bg: C.greenBg, bd: "#A7F3D0", fg: C.green, t: "✓ Quadratura corretta" },
    NON_QUADRATO: { bg: C.redBg, bd: "#FECACA", fg: C.red, t: "✕ Importi non corrispondenti" },
    DA_CONTROLLARE: { bg: C.amberBg, bd: "#FDE68A", fg: C.amber, t: "⚠ Da controllare" },
  } as Record<string, any>)[status] || { bg: C.amberBg, bd: "#FDE68A", fg: C.amber, t: "⚠ Da controllare" };
  const Row = ({ l, v, strong }: any) => <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}><Text style={{ color: C.sub }}>{l}</Text><Text style={{ fontWeight: strong ? "800" : "700", color: strong ? (diff === 0 ? C.green : C.red) : C.ink }}>{v}</Text></View>;
  return (
    <Card style={{ backgroundColor: cfg.bg, borderColor: cfg.bd }}>
      <Text style={{ fontSize: 17, fontWeight: "800", color: cfg.fg, marginBottom: 8 }}>{cfg.t}</Text>
      <Row l="Totale corrispettivi (azzeramenti)" v={totalCents == null ? "—" : formatEuro(totalCents)} />
      <Row l="Somma reparti" v={formatEuro(dept)} />
      <View style={{ height: 1, backgroundColor: "rgba(0,0,0,0.08)", marginVertical: 4 }} />
      <Row l="Differenza (Controllo B)" v={diff == null ? "—" : formatEuro(diff)} strong />
      {printed != null && (
        <View style={{ marginTop: 8, backgroundColor: "rgba(255,255,255,0.6)", borderRadius: 8, padding: 8 }}>
          <Row l="TOT EUR documento" v={formatEuro(printed)} />
          <Row l="Controllo A (TOT EUR − reparti)" v={checkA == null ? "—" : formatEuro(checkA)} />
        </View>
      )}
    </Card>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderBottomWidth: 1, borderColor: C.border, backgroundColor: "#fff" },
  back: { color: C.ink, fontSize: 28, width: 24 },
  title: { fontSize: 17, fontWeight: "800", color: C.ink },
  hsub: { fontSize: 12, color: C.sub },
  sect: { fontSize: 16, fontWeight: "800", color: C.ink },
  p: { color: C.sub, marginVertical: 8, fontSize: 14 },
  box: { backgroundColor: "#F8FAFC", borderRadius: 10, padding: 10, marginBottom: 10 },
  boxRow: { color: C.ink, fontSize: 14 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: "#fff", borderTopWidth: 1, borderColor: C.border },
  loading: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center" },
});
