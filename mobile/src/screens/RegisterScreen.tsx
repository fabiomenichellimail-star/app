import React, { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { getRegister, listEntries, deleteEntry, deleteRegister, duplicateRegister } from "../db";
import { exportPdf, printPdf } from "../files/pdf";
import { exportXlsx } from "../files/xlsx";
import { exportBackup, pickAndValidateBackup, applyBackup } from "../files/backup";
import { StatusBadge } from "../components/ui";
import { formatCents, formatEuro } from "../lib/money";
import { formatDateIt, MONTHS_IT } from "../lib/util";
import { C } from "../theme";

export default function RegisterScreen({ navigation, route }: any) {
  const { id } = route.params;
  const [reg, setReg] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [sel, setSel] = useState<number | null>(null); // 0 = anno, 1..12 month

  const load = useCallback(async () => {
    const r = await getRegister(id);
    if (!r) { navigation.goBack(); return; }
    setReg(r);
    const e = await listEntries(id);
    setEntries(e);
    setSel((prev) => {
      if (prev !== null) return prev;
      const last = e[e.length - 1];
      return last ? parseInt(last.business_date.slice(5, 7), 10) : new Date().getMonth() + 1;
    });
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const year = reg?.year || new Date().getFullYear();
  const active = (reg?.columns || []).filter((c: any) => c.active);
  const monthKey = sel && sel > 0 ? `${year}-${String(sel).padStart(2, "0")}` : null;
  const visible = useMemo(() => monthKey ? entries.filter((e) => e.business_date.startsWith(monthKey)) : entries, [entries, monthKey]);

  const totals = useMemo(() => {
    const t: any = { total: 0 }; active.forEach((c: any) => (t[c.id] = 0));
    visible.forEach((e) => { t.total += e.total_receipts_cents || 0; active.forEach((c: any) => (t[c.id] += (e.values || {})[c.id] || 0)); });
    return t;
  }, [visible, active]);

  const menu = () => Alert.alert("Impostazioni registro", reg?.name, [
    { text: "Gestisci colonne", onPress: () => navigation.navigate("ConfigColumns", { id }) },
    { text: "Duplica registro", onPress: dup },
    { text: "Esporta backup", onPress: () => exportBackup().catch(() => Alert.alert("Errore", "Backup non riuscito")) },
    { text: "Importa / ripristina backup", onPress: doImport },
    { text: "Elimina registro", style: "destructive", onPress: delReg },
    { text: "Annulla", style: "cancel" },
  ]);

  const dup = () => Alert.prompt?.("Duplica registro", "Nome del nuovo registro (colonne/alias copiati, giornate NO):",
    async (name?: string) => { const nid = await duplicateRegister(id, name || `${reg.name} (copia)`, null); if (nid) navigation.replace("Register", { id: nid }); },
    "plain-text", `${reg?.name} (copia)`) ?? Alert.alert("Duplica", "Verrà creata una copia con le stesse colonne.", [
      { text: "Annulla", style: "cancel" },
      { text: "Duplica", onPress: async () => { const nid = await duplicateRegister(id, `${reg.name} (copia)`, null); if (nid) navigation.replace("Register", { id: nid }); } },
    ]);

  const delReg = () => Alert.alert("Eliminare il registro?", `Verranno eliminate tutte le ${entries.length} giornate. Irreversibile.`, [
    { text: "Annulla", style: "cancel" },
    { text: "Elimina", style: "destructive", onPress: async () => { await deleteRegister(id); navigation.navigate("Home"); } },
  ]);

  const doImport = async () => {
    const pv = await pickAndValidateBackup();
    if (!pv.valid) { if (pv.error !== "annullato") Alert.alert("Backup non valido", pv.error || ""); return; }
    Alert.alert("Ripristina backup", `Verranno AGGIUNTI ${pv.registers} registri (${pv.entries} giornate) come NUOVI registri. I dati esistenti non vengono sovrascritti.`, [
      { text: "Annulla", style: "cancel" },
      { text: "Importa", onPress: async () => { const n = await applyBackup(pv.data); Alert.alert("Fatto", `Importati ${n} registri`); load(); } },
    ]);
  };

  const delEntry = (e: any) => Alert.alert("Eliminare la giornata?", `Giornata del ${formatDateIt(e.business_date)}. Irreversibile.`, [
    { text: "Annulla", style: "cancel" },
    { text: "Elimina", style: "destructive", onPress: async () => { await deleteEntry(e.id); load(); } },
  ]);

  if (!reg) return <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} />;

  const colW = 110;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.navigate("Home")}><Text style={st.back}>‹</Text></TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.title} numberOfLines={1}>{reg.name}</Text>
          <Text style={st.hsub}>{reg.business_name ? reg.business_name + " · " : ""}{year}</Text>
        </View>
        <TouchableOpacity onPress={menu}><Text style={st.menu}>⋮</Text></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate("NewDay", { registerId: id })} style={st.newDay}>
          <Text style={st.newDayTxt}>＋  Nuova giornata · leggi documenti</Text>
        </TouchableOpacity>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          <Tab label="Anno" on={sel === 0} onPress={() => setSel(0)} />
          {MONTHS_IT.map((m, i) => <Tab key={i} label={m.slice(0, 3)} on={sel === i + 1} onPress={() => setSel(i + 1)} />)}
        </ScrollView>

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <Mini label="PDF" onPress={() => exportPdf(reg, reg.columns, visible, monthKey).catch(() => Alert.alert("Errore", "PDF non riuscito"))} />
          <Mini label="Excel" onPress={() => exportXlsx(reg, reg.columns, visible, (reg.name || "registro").replace(/[^\w-]+/g, "_") + (monthKey ? "_" + monthKey : "")).catch(() => Alert.alert("Errore", "Excel non riuscito"))} />
          <Mini label="Stampa" onPress={() => printPdf(reg, reg.columns, visible, monthKey).catch(() => { })} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            <View style={[st.tr, { backgroundColor: C.ink }]}>
              <Cell w={90} head>Data</Cell>
              <Cell w={colW} head right>Totale</Cell>
              {active.map((c: any) => <Cell key={c.id} w={colW} head right>{c.display_name}</Cell>)}
              <Cell w={120} head center>Stato</Cell>
            </View>
            {visible.length === 0 ? (
              <View style={[st.tr, { padding: 20 }]}><Text style={{ color: C.mute }}>Nessuna giornata in questo periodo.</Text></View>
            ) : visible.map((e) => (
              <TouchableOpacity key={e.id} activeOpacity={0.7} onLongPress={() => delEntry(e)}
                onPress={() => navigation.navigate("NewDay", { registerId: id, entryId: e.id })}>
                <View style={st.tr}>
                  <Cell w={90}>{formatDateIt(e.business_date)}</Cell>
                  <Cell w={colW} right bold>{formatCents(e.total_receipts_cents)}</Cell>
                  {active.map((c: any) => <Cell key={c.id} w={colW} right>{(e.values || {})[c.id] != null ? formatCents((e.values || {})[c.id]) : ""}</Cell>)}
                  <View style={{ width: 120, padding: 8, justifyContent: "center" }}><StatusBadge status={e.reconciliation_status} /></View>
                </View>
              </TouchableOpacity>
            ))}
            {visible.length > 0 && (
              <View style={[st.tr, { backgroundColor: "#E2E8F0", borderTopWidth: 2, borderColor: C.ink }]}>
                <Cell w={90} bold>{monthKey ? `Tot. ${MONTHS_IT[(sel as number) - 1].slice(0, 3)}` : "Tot. anno"}</Cell>
                <Cell w={colW} right bold>{formatCents(totals.total)}</Cell>
                {active.map((c: any) => <Cell key={c.id} w={colW} right bold>{formatCents(totals[c.id])}</Cell>)}
                <Cell w={120}> </Cell>
              </View>
            )}
          </View>
        </ScrollView>
        <Text style={{ color: C.mute, fontSize: 12, marginTop: 10 }}>Tocca una riga per modificarla · tieni premuto per eliminarla</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Tab({ label, on, onPress }: any) {
  return <TouchableOpacity onPress={onPress} style={[st.tab, on && { backgroundColor: C.ink }]}><Text style={[st.tabTxt, on && { color: "#fff" }]}>{label}</Text></TouchableOpacity>;
}
function Mini({ label, onPress }: any) {
  return <TouchableOpacity onPress={onPress} style={st.mini}><Text style={{ color: C.ink, fontWeight: "700" }}>{label}</Text></TouchableOpacity>;
}
function Cell({ children, w, head, right, center, bold }: any) {
  return (
    <View style={{ width: w, padding: 8, borderWidth: 0.5, borderColor: head ? C.ink : C.border, justifyContent: "center" }}>
      <Text numberOfLines={2} style={{ color: head ? "#fff" : C.ink, fontWeight: head || bold ? "700" : "400", fontSize: 12, textAlign: right ? "right" : center ? "center" : "left" }}>{children}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderBottomWidth: 1, borderColor: C.border, backgroundColor: "#fff" },
  back: { color: C.ink, fontSize: 28, width: 24 },
  title: { fontSize: 17, fontWeight: "800", color: C.ink },
  hsub: { fontSize: 12, color: C.sub },
  menu: { fontSize: 24, color: C.ink, paddingHorizontal: 6 },
  newDay: { backgroundColor: C.ink, borderRadius: 16, height: 60, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  newDayTxt: { color: "#fff", fontSize: 16, fontWeight: "700" },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: C.border, marginRight: 8 },
  tabTxt: { color: C.sub, fontWeight: "700" },
  mini: { backgroundColor: "#fff", borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 18, height: 44, alignItems: "center", justifyContent: "center" },
  tr: { flexDirection: "row" },
});
