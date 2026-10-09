import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { getColumns, addColumn, updateColumn, deleteColumn, reorderColumns, columnHasData } from "../db";
import { Btn, Card, Field } from "../components/ui";
import { C } from "../theme";

const emptyCol = () => ({ id: undefined as string | undefined, display_name: "", ocr_label: "", aliases: [] as string[], include_in_reconciliation: true, active: true });

export default function ConfigColumnsScreen({ navigation, route }: any) {
  const { id } = route.params; // register id
  const [cols, setCols] = useState<any[]>([]);
  const [originalIds, setOriginalIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const c = await getColumns(id);
    setCols(c.map((x: any) => ({ ...x, aliases: [...(x.aliases || [])] })));
    setOriginalIds(c.map((x: any) => x.id));
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const upd = (i: number, patch: any) => setCols((p) => p.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const move = (i: number, d: number) => setCols((p) => { const j = i + d; if (j < 0 || j >= p.length) return p; const n = [...p]; [n[i], n[j]] = [n[j], n[i]]; return n; });

  const removeAt = async (i: number) => {
    const col = cols[i];
    if (col.id && (await columnHasData(col.id))) {
      Alert.alert("Colonna con dati storici", `"${col.display_name}" ha importi salvati. Per non perdere dati verrà DISATTIVATA (non eliminata).`, [
        { text: "Annulla", style: "cancel" },
        { text: "Disattiva", onPress: () => upd(i, { active: false }) },
      ]);
      return;
    }
    Alert.alert("Rimuovere la colonna?", col.display_name || "Nuova colonna", [
      { text: "Annulla", style: "cancel" },
      { text: "Rimuovi", style: "destructive", onPress: () => setCols((p) => p.filter((_, j) => j !== i)) },
    ]);
  };

  const save = async () => {
    if (cols.find((c) => !c.display_name.trim())) return Alert.alert("Nome mancante", "Ogni colonna deve avere un nome visualizzato");
    setBusy(true);
    try {
      // assign ids to new columns (create), update existing
      for (const c of cols) {
        if (c.id) {
          await updateColumn(c.id, { display_name: c.display_name, ocr_label: c.ocr_label, aliases: c.aliases, include_in_reconciliation: c.include_in_reconciliation, active: c.active });
        } else {
          c.id = await addColumn(id, c);
        }
      }
      // removed columns: deactivate if they have data, else delete
      const keptIds = cols.filter((c) => c.id).map((c) => c.id);
      for (const oid of originalIds) {
        if (!keptIds.includes(oid)) {
          if (await columnHasData(oid)) await updateColumn(oid, { active: false });
          else await deleteColumn(oid);
        }
      }
      await reorderColumns(cols.map((c) => c.id));
      Alert.alert("Salvato", "Colonne aggiornate");
      navigation.goBack();
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={st.back}>‹</Text></TouchableOpacity>
        <Text style={st.title}>Gestisci colonne</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <View style={st.info}><Text style={st.infoTxt}><Text style={{ fontWeight: "800" }}>Data</Text> e <Text style={{ fontWeight: "800" }}>Totale Corrispettivi</Text> sono fisse. Le colonne con dati storici non vengono eliminate: vengono disattivate.</Text></View>
        {cols.map((c, i) => (
          <Card key={c.id || "new-" + i}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
              <Text style={st.colLabel}>Colonna {i + 1}{!c.active ? " · disattivata" : ""}</Text>
              <View style={{ flexDirection: "row", gap: 14 }}>
                <TouchableOpacity onPress={() => move(i, -1)}><Text style={st.icon}>▲</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => move(i, 1)}><Text style={st.icon}>▼</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => removeAt(i)}><Text style={[st.icon, { color: C.red }]}>🗑</Text></TouchableOpacity>
              </View>
            </View>
            <Field label="Nome visualizzato" value={c.display_name} onChangeText={(v: string) => upd(i, { display_name: v })} placeholder="es. IVA 10% Ristorante" />
            <Field label="Testo stampato (alias principale)" value={c.ocr_label} onChangeText={(v: string) => upd(i, { ocr_label: v })} placeholder="es. RISTORANTE" />
            <Field label="Alias aggiuntivi (separati da virgola)" value={(c.aliases || []).join(", ")} onChangeText={(v: string) => upd(i, { aliases: v.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="es. RIST., RISTORANTE 10" />
            <Row label="Inclusa nella quadratura" value={c.include_in_reconciliation} onValueChange={(v: boolean) => upd(i, { include_in_reconciliation: v })} />
            <Row label="Attiva" value={c.active} onValueChange={(v: boolean) => upd(i, { active: v })} />
          </Card>
        ))}
        <Btn title="＋ Aggiungi colonna" variant="outline" onPress={() => setCols((p) => [...p, emptyCol()])} />
      </ScrollView>
      <View style={st.footer}><Btn title={busy ? "Salvataggio…" : "Salva colonne"} onPress={save} disabled={busy} /></View>
    </SafeAreaView>
  );
}

function Row({ label, value, onValueChange }: any) {
  return <View style={st.row}><Text style={{ color: C.ink, fontWeight: "600" }}>{label}</Text><Switch value={value} onValueChange={onValueChange} /></View>;
}

const st = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderBottomWidth: 1, borderColor: C.border, backgroundColor: "#fff" },
  back: { color: C.ink, fontSize: 28, width: 24 },
  title: { fontSize: 18, fontWeight: "800", color: C.ink },
  info: { backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, marginBottom: 12 },
  infoTxt: { color: C.sub, fontSize: 13 },
  colLabel: { fontSize: 12, fontWeight: "800", color: C.sub },
  icon: { fontSize: 16, color: C.sub },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#F8FAFC", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: "#fff", borderTopWidth: 1, borderColor: C.border },
});
