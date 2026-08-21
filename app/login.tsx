import * as Auth from "@/lib/_core/auth";
import { trpc } from "@/lib/trpc";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type AuthMode = "login" | "signup";

function formatError(error: unknown) {
  return error instanceof Error ? error.message.replace(/^\[.*?\]\s*/, "") : "Không thể thực hiện thao tác. Vui lòng thử lại.";
}

export default function LoginScreen() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const login = trpc.auth.login.useMutation();
  const signup = trpc.auth.signup.useMutation();
  const submitting = login.isPending || signup.isPending;

  useEffect(() => {
    void Auth.getUserInfo().then((user) => {
      if (user) router.replace("/(tabs)");
    });
  }, []);

  const completeAuth = async (result: { token: string; user: Auth.User }) => {
    await Auth.setSessionToken(result.token);
    await Auth.setUserInfo(result.user);
    router.replace("/(tabs)");
  };

  const submit = async () => {
    setError(null);
    try {
      const normalizedUsername = username.trim().toLowerCase();
      if (mode === "signup") {
        await completeAuth(await signup.mutateAsync({ displayName: displayName.trim(), username: normalizedUsername, password }));
      } else {
        await completeAuth(await login.mutateAsync({ username: normalizedUsername, password }));
      }
    } catch (cause) {
      setError(formatError(cause));
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={styles.mark}><Text style={styles.markText}>P</Text></View>
            <Text style={styles.title}>ChatPHT</Text>
            <Text style={styles.subtitle}>Nhắn tin riêng tư, nhanh và tự nhiên.</Text>
            <Text style={styles.creator}>Tạo bởi Phùng Hải Trường</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.modeRow}>
              <Pressable onPress={() => { setMode("login"); setError(null); }} style={[styles.mode, mode === "login" && styles.modeActive]}>
                <Text style={[styles.modeText, mode === "login" && styles.modeTextActive]}>Đăng nhập</Text>
              </Pressable>
              <Pressable onPress={() => { setMode("signup"); setError(null); }} style={[styles.mode, mode === "signup" && styles.modeActive]}>
                <Text style={[styles.modeText, mode === "signup" && styles.modeTextActive]}>Tạo tài khoản</Text>
              </Pressable>
            </View>

            {mode === "signup" && (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Tên hiển thị</Text>
                <TextInput value={displayName} onChangeText={setDisplayName} placeholder="Ví dụ: Minh Anh" placeholderTextColor="#8A94A6" autoCapitalize="words" style={styles.input} returnKeyType="next" />
              </View>
            )}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Tên người dùng</Text>
              <TextInput value={username} onChangeText={setUsername} placeholder="minh_anh" placeholderTextColor="#8A94A6" autoCapitalize="none" autoCorrect={false} style={styles.input} returnKeyType="next" />
              {mode === "signup" && <Text style={styles.help}>3–24 ký tự: chữ thường, số hoặc dấu gạch dưới.</Text>}
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Mật khẩu</Text>
              <TextInput value={password} onChangeText={setPassword} placeholder="Ít nhất 8 ký tự" placeholderTextColor="#8A94A6" secureTextEntry style={styles.input} returnKeyType="done" onSubmitEditing={submit} />
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable disabled={submitting} onPress={submit} style={({ pressed }) => [styles.primaryButton, (pressed || submitting) && styles.primaryPressed]}>
              {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</Text>}
            </Pressable>
            <Text style={styles.privacy}>Không cần Gmail. Mật khẩu được bảo vệ bằng mã hóa một chiều trên máy chủ.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F6F8FC" },
  keyboard: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: "center", padding: 24 },
  hero: { alignItems: "center", marginBottom: 32 },
  mark: { width: 64, height: 64, borderRadius: 20, backgroundColor: "#2563EB", justifyContent: "center", alignItems: "center", shadowColor: "#2563EB", shadowOpacity: 0.28, shadowRadius: 12, elevation: 5 },
  markText: { color: "#FFFFFF", fontWeight: "800", fontSize: 30 },
  title: { marginTop: 14, color: "#172554", fontWeight: "800", fontSize: 31, letterSpacing: -0.5 },
  subtitle: { marginTop: 6, color: "#64748B", fontSize: 15, textAlign: "center" },
  creator: { marginTop: 7, color: "#2563EB", fontSize: 12.5, fontWeight: "700" },
  card: { backgroundColor: "#FFFFFF", borderRadius: 24, padding: 20, borderWidth: 1, borderColor: "#E6EAF1", shadowColor: "#162D5A", shadowOpacity: 0.07, shadowRadius: 15, elevation: 2 },
  modeRow: { flexDirection: "row", borderRadius: 12, backgroundColor: "#EEF2F8", padding: 3, marginBottom: 22 },
  mode: { flex: 1, alignItems: "center", borderRadius: 9, paddingVertical: 10 },
  modeActive: { backgroundColor: "#FFFFFF", shadowColor: "#172554", shadowOpacity: 0.11, shadowRadius: 4, elevation: 1 },
  modeText: { color: "#64748B", fontSize: 14, fontWeight: "700" },
  modeTextActive: { color: "#1D4ED8" },
  fieldGroup: { marginBottom: 15 },
  label: { color: "#334155", fontSize: 13, fontWeight: "700", marginBottom: 7 },
  input: { minHeight: 48, borderWidth: 1, borderColor: "#D8E0EC", borderRadius: 12, paddingHorizontal: 14, color: "#0F172A", fontSize: 16, backgroundColor: "#FFFFFF" },
  help: { marginTop: 6, color: "#778398", fontSize: 12, lineHeight: 17 },
  error: { color: "#C92A2A", backgroundColor: "#FFF0F0", borderRadius: 10, overflow: "hidden", padding: 10, fontSize: 13, marginBottom: 14 },
  primaryButton: { minHeight: 52, borderRadius: 14, backgroundColor: "#2563EB", justifyContent: "center", alignItems: "center", marginTop: 6 },
  primaryPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  privacy: { color: "#7B8798", fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 16, paddingHorizontal: 8 },
});
