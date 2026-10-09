import React, { useState } from "react";
import { Text, TextInput, TouchableOpacity, View, StyleSheet, ViewStyle } from "react-native";
import { C } from "../theme";
import { formatCents, parseAmountToCents as parseToCents } from "../lib/money";

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Btn({ title, onPress, variant = "primary", disabled, style }: any) {
  const v = variant === "outline" ? s.btnOutline : variant === "ghost" ? s.btnGhost : s.btnPrimary;
  const t = variant === "primary" ? s.btnPrimaryTxt : s.btnDarkTxt;
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} disabled={disabled}
      style={[s.btn, v, disabled && { opacity: 0.5 }, style]}>
      <Text style={[s.btnTxt, t]}>{title}</Text>
    </TouchableOpacity>
  );
}

export function Field({ label, value, onChangeText, keyboardType, placeholder }: any) {
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput style={s.input} value={value} onChangeText={onChangeText}
        keyboardType={keyboardType} placeholder={placeholder} placeholderTextColor={C.mute} />
    </View>
  );
}

// Money input: edits a raw string, reformats to it-IT on blur. Exposes cents via onCents.
export function MoneyInput({ label, valueStr, onChangeStr, warn }: any) {
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {label ? <Text style={s.label}>{label}</Text> : null}
        {warn ? <Text style={{ color: C.amber, fontWeight: "700", fontSize: 12 }}>⚠ Controllare</Text> : null}
      </View>
      <View style={{ position: "relative" }}>
        <Text style={s.euro}>€</Text>
        <TextInput style={[s.input, { paddingLeft: 28, textAlign: "right", fontWeight: "700" }, warn && { borderColor: C.amber, backgroundColor: C.amberBg }]}
          value={valueStr} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={C.mute}
          onChangeText={onChangeStr}
          onBlur={() => { const c = parseToCents(valueStr); onChangeStr(c == null ? "" : formatCents(c)); }} />
      </View>
    </View>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: any = {
    VERIFICATO: { t: "Verificato", bg: C.greenBg, fg: C.green, i: "✓" },
    NON_QUADRATO: { t: "Non quadrato", bg: C.redBg, fg: C.red, i: "✕" },
    DA_CONTROLLARE: { t: "Da controllare", bg: C.amberBg, fg: C.amber, i: "⚠" },
  };
  const c = map[status] || map.DA_CONTROLLARE;
  return (
    <View style={[s.badge, { backgroundColor: c.bg }]}>
      <Text style={{ color: c.fg, fontWeight: "700", fontSize: 11 }}>{c.i} {c.t}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  btn: { height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  btnPrimary: { backgroundColor: C.primary },
  btnOutline: { backgroundColor: "#fff", borderWidth: 1, borderColor: C.border },
  btnGhost: { backgroundColor: "transparent" },
  btnTxt: { fontSize: 16, fontWeight: "700" },
  btnPrimaryTxt: { color: "#fff" },
  btnDarkTxt: { color: C.ink },
  label: { fontSize: 12, fontWeight: "700", color: C.sub, marginBottom: 4 },
  input: { height: 48, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, fontSize: 16, color: C.ink, backgroundColor: "#fff" },
  euro: { position: "absolute", left: 12, top: 14, color: C.mute, fontSize: 16, zIndex: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: "flex-start" },
});
