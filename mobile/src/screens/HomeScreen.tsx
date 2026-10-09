import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { listRegisters } from "../db";
import { Btn, Card } from "../components/ui";
import { C } from "../theme";

export default function HomeScreen({ navigation }: any) {
  const [regs, setRegs] = useState<any[]>([]);
  useFocusEffect(useCallback(() => { listRegisters().then(setRegs); }, []));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={st.badge}><Text style={st.badgeTxt}>REGISTRO CORRISPETTIVI</Text></View>
        <Text style={st.h1}>I tuoi registri</Text>
        <Text style={st.sub}>Fotografa azzeramento e reparti: l'app compila e quadra la giornata. 100% offline.</Text>

        <Btn title="＋  Crea nuovo registro" onPress={() => navigation.navigate("Create")} style={{ marginBottom: 12, height: 60 }} />
        <Btn title="📂  Apri registro esistente" variant="outline"
          onPress={() => { }} style={{ marginBottom: 24, height: 60 }} />

        <Text style={st.section}>REGISTRI SALVATI</Text>
        {regs.length === 0 ? (
          <Card><Text style={{ color: C.mute, textAlign: "center" }}>Nessun registro. Creane uno per iniziare.</Text></Card>
        ) : regs.map((r) => (
          <TouchableOpacity key={r.id} activeOpacity={0.8} onPress={() => navigation.navigate("Register", { id: r.id })}>
            <Card style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={st.regName}>{r.name}</Text>
                <Text style={st.regSub}>{r.business_name ? r.business_name + " · " : ""}{r.year || ""} · {r.entries_count} giornate</Text>
              </View>
              <Text style={{ color: C.mute, fontSize: 22 }}>›</Text>
            </Card>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  badge: { backgroundColor: C.ink, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, marginBottom: 12 },
  badgeTxt: { color: "#fff", fontSize: 11, fontWeight: "800" },
  h1: { fontSize: 30, fontWeight: "800", color: C.ink },
  sub: { fontSize: 15, color: C.sub, marginTop: 8, marginBottom: 24 },
  section: { fontSize: 12, fontWeight: "800", color: C.sub, marginBottom: 10, letterSpacing: 0.5 },
  regName: { fontSize: 16, fontWeight: "700", color: C.ink },
  regSub: { fontSize: 13, color: C.sub, marginTop: 2 },
});
