import React, { useRef, useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { C } from "../theme";

// Full-screen camera with a central vertical guide for receipts.
// Returns the captured photo uri + dimensions; cropping happens in the caller.
export function CameraCapture({ visible, title, onCancel, onCaptured }: {
  visible: boolean; title: string; onCancel: () => void;
  onCaptured: (uri: string, width: number, height: number) => void;
}) {
  const [perm, requestPerm] = useCameraPermissions();
  const camRef = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (visible && perm && !perm.granted) requestPerm();
  }, [visible, perm]);

  const shoot = async () => {
    if (!camRef.current || busy) return;
    setBusy(true);
    try {
      const photo = await camRef.current.takePictureAsync({ quality: 0.9, skipProcessing: false });
      if (photo) onCaptured(photo.uri, photo.width, photo.height);
    } finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={st.root}>
        <View style={st.top}>
          <Text style={st.title}>{title}</Text>
          <TouchableOpacity onPress={onCancel}><Text style={st.close}>✕</Text></TouchableOpacity>
        </View>

        {perm?.granted ? (
          <View style={{ flex: 1 }}>
            <CameraView ref={camRef} style={{ flex: 1 }} facing="back" />
            <View style={st.overlay} pointerEvents="none">
              <View style={st.guide} />
              <Text style={st.hint}>Posiziona lo scontrino dentro il riquadro</Text>
            </View>
          </View>
        ) : (
          <View style={st.center}>
            <Text style={st.permTxt}>Serve il permesso fotocamera per leggere gli scontrini.</Text>
            <TouchableOpacity style={st.permBtn} onPress={requestPerm}>
              <Text style={{ color: "#fff", fontWeight: "700" }}>Concedi permesso</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={st.bottom}>
          <TouchableOpacity onPress={shoot} disabled={!perm?.granted || busy} style={st.shutterWrap}>
            {busy ? <ActivityIndicator color="#fff" /> : <View style={st.shutter} />}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, paddingTop: 48 },
  title: { color: "#fff", fontSize: 16, fontWeight: "700" },
  close: { color: "#fff", fontSize: 22 },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  guide: { width: "80%", height: "70%", borderWidth: 2, borderColor: "rgba(255,255,255,0.9)", borderRadius: 16 },
  hint: { position: "absolute", bottom: 24, color: "#fff", backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  permTxt: { color: "#fff", textAlign: "center", marginBottom: 16 },
  permBtn: { backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  bottom: { height: 120, alignItems: "center", justifyContent: "center", backgroundColor: "#000" },
  shutterWrap: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  shutter: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#fff" },
});
