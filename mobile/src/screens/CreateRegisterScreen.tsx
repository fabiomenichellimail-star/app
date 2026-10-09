import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createRegister } from "../db";
import { Btn, Card, Field } from "../components/ui";
import { C } from "../theme";

const emptyCol = () => ({ display_name: "", ocr_label: "", aliases: [] as string[], include_in_reconciliation: true, active: true });

export default function CreateRegisterScreen({ navigation }: any) {
  const [name, setName] = useState("");
  const [business, setBusiness] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [cols, setCols] = useState<any[]>([]);

  const upd = (i: number, patch: any) => setCols((p) => p.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const move = (i: number, d: number) => setCols((p) => {
    const j = i + d; if (j < 0 || j >= p.length) return p;
    const n = [...p]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });

  const save = async () => {
    if (!name.trim()) return Alert.alert("Nome mancante", "Inserisci il nome del registro");
    if (cols.find((c) => !c.display_name.trim())) return Alert.alert("Colonna senza nome", "Ogni colonna deve avere un nome visualizzato");
    const id = await createRegister({
      name: name.trim(), business_name: business.trim(),
      year: year ? parseInt(year, 10) : null, total_aliases: [], columns: cols,
    });
    navigation.replace("Register", { id });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={st.back}>‹ Indietro</Text></TouchableOpacity>
        <Text style={st.title}>Nuovo registro</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <Card>
          <Field label="Nome registro *" value={name} onChangeText={setName} placeholder="Registro Corrispettivi 2026" />
          <Field label="Nome attività / intestazione" value={business} onChangeText={setBusiness} placeholder="Bar Centrale" />
          <Field label="Anno" value={year} onChangeText={setYear} keyboardType="number-pad" />
        </Card>

        <Text style={st.sect}>Colonne del registro</Text>
        <View style={st.info}><Text style={st.infoTxt}>Le prime due colonne <Text style={{ fontWeight: "800" }}>Data</Text> e <Text style={{ fontWeight: "800" }}>Totale Corrispettivi</Text> sono sempre fisse. Aggiungi qui i reparti.</Text></View>

        {cols.map((c, i) => (
          <Card key={i}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
              <Text style={st.colLabel}>Colonna {i + 1}</Text>
              <View style={{ flexDirection: "row", gap: 14 }}>
                <TouchableOpacity onPress={() => move(i, -1)}><Text style={st.icon}>▲</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => move(i, 1)}><Text style={st.icon}>▼</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => setCols((p) => p.filter((_, j) => j !== i))}><Text style={[st.icon, { color: C.red }]}>🗑</Text></TouchableOpacity>
              </View>
            </View>
            <Field label="Nome visualizzato" value={c.display_name} onChangeText={(v: string) => upd(i, { display_name: v })} placeholder="es. IVA 10% Ristorante" />
            <Field label="Testo stampato (alias principale)" value={c.ocr_label} onChangeText={(v: string) => upd(i, { ocr_label: v })} placeholder="es. RISTORANTE" />
            <Field label="Alias aggiuntivi (separati da virgola)" value={(c.aliases || []).join(", ")}
              onChangeText={(v: string) => upd(i, { aliases: v.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="es. RIST., RISTORANTE 10" />
            <Row label="Inclusa nella quadratura" value={c.include_in_reconciliation} onValueChange={(v: boolean) => upd(i, { include_in_reconciliation: v })} />
            <Row label="Attiva" value={c.active} onValueChange={(v: boolean) => upd(i, { active: v })} />
          </Card>
        ))}
        <Btn title="＋ Aggiungi colonna" variant="outline" onPress={() => setCols((p) => [...p, emptyCol()])} />
      </ScrollView>

      <View style={st.footer}><Btn title="Crea registro" onPress={save} /></View>
    </SafeAreaView>
  );
}

function Row({ label, value, onValueChange }: any) {
  return (
    <View style={st.row}>
      <Text style={{ color: C.ink, fontWeight: "600" }}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderBottomWidth: 1, borderColor: C.border, backgroundColor: "#fff" },
  back: { color: C.ink, fontSize: 16 },
  title: { fontSize: 18, fontWeight: "800", color: C.ink },
  sect: { fontSize: 20, fontWeight: "800", color: C.ink, marginVertical: 12 },
  info: { backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, marginBottom: 12 },
  infoTxt: { color: C.sub, fontSize: 13 },
  colLabel: { fontSize: 12, fontWeight: "800", color: C.sub },
  icon: { fontSize: 16, color: C.sub },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#F8FAFC", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: "#fff", borderTopWidth: 1, borderColor: C.border },
});
