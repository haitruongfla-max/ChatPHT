import { hasAppLockPin, subscribeToAppLockChanges, verifyAppLockPin } from "@/lib/app-lock";
import { useAuth } from "@/hooks/use-auth";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function AppLockGate() {
  const { user } = useAuth();
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const [configured, setConfigured] = useState(false);
  const [locked, setLocked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void hasAppLockPin().then((present) => {
      if (!active) return;
      setConfigured(present);
      setLocked(Boolean(user && present));
      setChecking(false);
    });
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    const unsubscribe = subscribeToAppLockChanges((change) => {
      setConfigured(change === "configured");
      setLocked(false);
      setPin("");
      setError("");
    });
    return () => { unsubscribe(); };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const wasBackgrounded = appState.current === "inactive" || appState.current === "background";
      if (wasBackgrounded && nextState === "active" && configured && user) {
        setLocked(true);
        setPin("");
        setError("");
      }
      appState.current = nextState;
    });
    return () => subscription.remove();
  }, [configured, user?.id]);

  const unlock = async () => {
    if (!(await verifyAppLockPin(pin))) {
      setError("Mã khóa chưa đúng. Hãy thử lại.");
      setPin("");
      return;
    }
    setError("");
    setPin("");
    setLocked(false);
  };

  if (checking && user) return <View style={styles.overlay} />;
  if (!user || !configured || !locked) return null;
  return (
    <View style={styles.overlay} accessibilityViewIsModal>
      <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
        <KeyboardAvoidingView style={styles.content} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.icon}><MaterialIcons name="lock" size={30} color="#2563EB" /></View>
          <Text style={styles.title}>SwiftChat đang bị khóa</Text>
          <Text style={styles.subtitle}>Nhập mã khóa ứng dụng để tiếp tục xem các cuộc trò chuyện riêng tư.</Text>
          <TextInput
            autoFocus
            value={pin}
            onChangeText={(value) => { setPin(value.replace(/\D/g, "").slice(0, 8)); setError(""); }}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={8}
            returnKeyType="done"
            onSubmitEditing={() => void unlock()}
            style={[styles.input, error && styles.inputError]}
            accessibilityLabel="Mã khóa ứng dụng"
          />
          {error ? <Text style={styles.error}>{error}</Text> : <Text style={styles.hint}>Mã khóa có 4 đến 8 chữ số.</Text>}
          <Pressable onPress={() => void unlock()} disabled={pin.length < 4} style={({ pressed }) => [styles.button, pin.length < 4 && styles.disabled, pressed && styles.pressed]}>
            <Text style={styles.buttonText}>Mở khóa</Text>
          </Pressable>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 1000, elevation: 1000, backgroundColor: "#F6F8FC" },
  safe: { flex: 1 }, content: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  icon: { width: 72, height: 72, borderRadius: 25, backgroundColor: "#E9EFFD", alignItems: "center", justifyContent: "center" },
  title: { marginTop: 20, color: "#172554", fontSize: 23, fontWeight: "800", textAlign: "center" },
  subtitle: { maxWidth: 300, marginTop: 10, color: "#64748B", fontSize: 14, lineHeight: 20, textAlign: "center" },
  input: { width: "100%", maxWidth: 290, marginTop: 26, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 16, paddingHorizontal: 18, height: 54, fontSize: 22, letterSpacing: 9, textAlign: "center", color: "#172554" },
  inputError: { borderColor: "#DC2626" }, hint: { marginTop: 8, color: "#718096", fontSize: 12.5 }, error: { marginTop: 8, color: "#C92A2A", fontSize: 12.5, fontWeight: "700" },
  button: { width: "100%", maxWidth: 290, minHeight: 52, marginTop: 18, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#2563EB" },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" }, disabled: { backgroundColor: "#AAB4C5" }, pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
