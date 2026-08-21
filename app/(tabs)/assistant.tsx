import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Redirect } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type AssistantTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const SUGGESTIONS = ["Viết lời chúc sinh nhật ngắn", "Gợi ý kế hoạch cuối tuần", "Tóm tắt một ý tưởng kinh doanh"];

export default function AssistantScreen() {
  const { user, loading } = useAuth();
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const listRef = useRef<FlatList<AssistantTurn>>(null);
  const askAssistant = trpc.assistant.ask.useMutation({
    onSuccess: ({ answer }) => {
      setTurns((previous) => [...previous, { id: `assistant-${Date.now()}`, role: "assistant", content: answer }]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 40);
    },
  });

  if (loading) return <ScreenContainer className="items-center justify-center"><ActivityIndicator color="#2563EB" /></ScreenContainer>;
  if (!user) return <Redirect href={"/login" as never} />;

  const submit = (value = draft) => {
    const message = value.trim();
    if (!message || askAssistant.isPending) return;
    const history = turns.slice(-6).map(({ role, content }) => ({ role, content }));
    setTurns((previous) => [...previous, { id: `user-${Date.now()}`, role: "user", content: message }]);
    setDraft("");
    askAssistant.mutate({ message, context: history });
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 40);
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.hero}>
          <View style={styles.heroMark}><MaterialIcons name="auto-awesome" size={23} color="#FFFFFF" /></View>
          <View style={styles.heroCopy}><Text style={styles.kicker}>CHATPHT AI</Text><Text style={styles.title}>Hỏi nhanh, đáp riêng tư</Text><Text style={styles.subtitle}>Cuộc trao đổi AI tách biệt với các hội thoại cá nhân của bạn.</Text></View>
        </View>

        <FlatList
          ref={listRef}
          data={turns}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={turns.length ? styles.listContent : styles.emptyList}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <View style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.aiBubble]}><Text style={[styles.bubbleLabel, item.role === "user" ? styles.userLabel : styles.aiLabel]}>{item.role === "user" ? "Bạn" : "Trợ lý AI"}</Text><Text style={[styles.bubbleText, item.role === "user" ? styles.userText : styles.aiText]}>{item.content}</Text></View>}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><MaterialIcons name="psychology" size={34} color="#2563EB" /></View>
              <Text style={styles.emptyTitle}>Chào {user.displayName}</Text>
              <Text style={styles.emptyBody}>Bạn muốn cùng ChatPHT AI giải quyết việc gì?</Text>
              <View style={styles.suggestionWrap}>{SUGGESTIONS.map((suggestion) => <Pressable key={suggestion} onPress={() => submit(suggestion)} style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}><Text style={styles.suggestionText}>{suggestion}</Text><MaterialIcons name="north-east" size={16} color="#2563EB" /></Pressable>)}</View>
            </View>
          }
        />

        {askAssistant.error && <Text style={styles.error}>{askAssistant.error.message}</Text>}
        <View style={styles.composer}>
          <TextInput value={draft} onChangeText={setDraft} placeholder="Hỏi Trợ lý AI..." placeholderTextColor="#8A96AA" multiline maxLength={2000} style={styles.input} editable={!askAssistant.isPending} />
          <Pressable accessibilityRole="button" accessibilityLabel="Gửi câu hỏi AI" onPress={() => submit()} disabled={!draft.trim() || askAssistant.isPending} style={({ pressed }) => [styles.send, (!draft.trim() || askAssistant.isPending) && styles.sendDisabled, pressed && styles.pressed]}>
            {askAssistant.isPending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <MaterialIcons name="arrow-upward" size={22} color="#FFFFFF" />}
          </Pressable>
        </View>
        <Text style={styles.notice}>Trợ lý AI có thể sai; không nhập mật khẩu hoặc thông tin nhạy cảm.</Text>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  hero: { marginHorizontal: 16, marginTop: 8, padding: 18, borderRadius: 24, backgroundColor: "#152C67", flexDirection: "row", gap: 13, shadowColor: "#172554", shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  heroMark: { width: 46, height: 46, borderRadius: 16, backgroundColor: "#3974F4", alignItems: "center", justifyContent: "center" }, heroCopy: { flex: 1 }, kicker: { fontSize: 10, letterSpacing: 1.4, color: "#9EC2FF", fontWeight: "800" }, title: { marginTop: 2, color: "#FFFFFF", fontSize: 19, fontWeight: "800" }, subtitle: { marginTop: 4, color: "#D9E7FF", fontSize: 12.5, lineHeight: 18 },
  list: { flex: 1 }, listContent: { padding: 16, gap: 10, paddingBottom: 10 }, emptyList: { flexGrow: 1, padding: 24 }, empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 26 }, emptyIcon: { width: 70, height: 70, borderRadius: 24, backgroundColor: "#DFE9FF", alignItems: "center", justifyContent: "center" }, emptyTitle: { marginTop: 16, color: "#162B54", fontSize: 21, fontWeight: "800" }, emptyBody: { marginTop: 7, maxWidth: 280, color: "#70809A", textAlign: "center", fontSize: 14, lineHeight: 20 }, suggestionWrap: { width: "100%", maxWidth: 360, marginTop: 20, gap: 8 }, suggestion: { minHeight: 47, borderWidth: 1, borderColor: "#DCE6FA", borderRadius: 15, backgroundColor: "#FFFFFF", paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, suggestionText: { color: "#1D4ED8", fontWeight: "700", fontSize: 13 },
  bubble: { maxWidth: "86%", paddingHorizontal: 14, paddingVertical: 11, borderRadius: 18 }, userBubble: { alignSelf: "flex-end", backgroundColor: "#2563EB", borderBottomRightRadius: 5 }, aiBubble: { alignSelf: "flex-start", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E0E7F3", borderBottomLeftRadius: 5 }, bubbleLabel: { fontSize: 10.5, fontWeight: "800", marginBottom: 4 }, userLabel: { color: "#CFE0FF" }, aiLabel: { color: "#356DE7" }, bubbleText: { fontSize: 14.5, lineHeight: 21 }, userText: { color: "#FFFFFF" }, aiText: { color: "#263653" },
  composer: { marginHorizontal: 16, marginTop: 8, padding: 6, borderWidth: 1, borderColor: "#D9E3F5", borderRadius: 20, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "flex-end", shadowColor: "#123471", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 }, input: { flex: 1, minHeight: 42, maxHeight: 104, paddingHorizontal: 11, paddingVertical: 9, color: "#172554", fontSize: 15, lineHeight: 20 }, send: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#2563EB", alignItems: "center", justifyContent: "center" }, sendDisabled: { backgroundColor: "#9BA9C0" }, pressed: { opacity: 0.78, transform: [{ scale: 0.97 }] }, error: { marginHorizontal: 20, marginTop: 8, color: "#C2410C", fontSize: 12, textAlign: "center" }, notice: { color: "#7B879B", paddingHorizontal: 24, paddingTop: 8, paddingBottom: 10, textAlign: "center", fontSize: 10.5, lineHeight: 15 },
});
