import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Redirect } from "expo-router";
import { useCallback, useRef, useState } from "react";
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
  const [failedTurn, setFailedTurn] = useState<AssistantTurn | null>(null);
  const listRef = useRef<FlatList<AssistantTurn>>(null);
  const pendingTurnRef = useRef<AssistantTurn | null>(null);

  const scrollToLatest = useCallback((animated = true) => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated }), 80);
  }, []);

  const askAssistant = trpc.assistant.ask.useMutation({
    onSuccess: ({ answer }) => {
      pendingTurnRef.current = null;
      setFailedTurn(null);
      setTurns((previous) => [
        ...previous,
        { id: `assistant-${Date.now()}`, role: "assistant", content: answer },
      ]);
      scrollToLatest();
    },
    onError: () => {
      if (pendingTurnRef.current) setFailedTurn(pendingTurnRef.current);
      scrollToLatest();
    },
  });

  if (loading) {
    return (
      <ScreenContainer className="items-center justify-center">
        <ActivityIndicator color="#2563EB" />
      </ScreenContainer>
    );
  }
  if (!user) return <Redirect href={"/login" as never} />;

  const submit = (value = draft, retryTurnId?: string) => {
    const message = value.trim();
    if (!message || askAssistant.isPending) return;

    const history = turns
      .filter((turn) => turn.id !== retryTurnId)
      .slice(-6)
      .map(({ role, content }) => ({ role, content }));

    if (retryTurnId) {
      const retryTurn = turns.find((turn) => turn.id === retryTurnId) ?? null;
      pendingTurnRef.current = retryTurn;
      setFailedTurn(null);
    } else {
      const userTurn = { id: `user-${Date.now()}`, role: "user" as const, content: message };
      pendingTurnRef.current = userTurn;
      setTurns((previous) => [...previous, userTurn]);
      setDraft("");
    }

    askAssistant.mutate({ message, context: history });
    scrollToLatest();
  };

  const renderTurn = ({ item }: { item: AssistantTurn }) => (
    <View style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.aiBubble]}>
      <Text style={[styles.bubbleLabel, item.role === "user" ? styles.userLabel : styles.aiLabel]}>
        {item.role === "user" ? "Bạn" : "Trợ lý AI"}
      </Text>
      <Text style={[styles.bubbleText, item.role === "user" ? styles.userText : styles.aiText]}>{item.content}</Text>
    </View>
  );

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <View style={styles.hero}>
          <View style={styles.heroMark}>
            <MaterialIcons name="auto-awesome" size={23} color="#FFFFFF" />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.kicker}>CHATPHT AI</Text>
            <Text style={styles.title}>Hỏi nhanh, đáp riêng tư</Text>
            <Text style={styles.subtitle}>Cuộc trao đổi AI tách biệt với các hội thoại cá nhân của bạn.</Text>
          </View>
        </View>

        <FlatList
          ref={listRef}
          data={turns}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={turns.length ? styles.listContent : styles.emptyList}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          onContentSizeChange={() => scrollToLatest(false)}
          renderItem={renderTurn}
          ListFooterComponent={
            askAssistant.isPending ? (
              <View style={[styles.bubble, styles.aiBubble, styles.typingBubble]} accessibilityLabel="Trợ lý AI đang soạn câu trả lời">
                <ActivityIndicator size="small" color="#2563EB" />
                <Text style={styles.typingText}>Trợ lý AI đang soạn câu trả lời…</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <MaterialIcons name="psychology" size={34} color="#2563EB" />
              </View>
              <Text style={styles.emptyTitle}>Chào {user.displayName}</Text>
              <Text style={styles.emptyBody}>Bạn muốn cùng ChatPHT AI giải quyết việc gì?</Text>
              <View style={styles.suggestionWrap}>
                {SUGGESTIONS.map((suggestion) => (
                  <Pressable
                    key={suggestion}
                    accessibilityRole="button"
                    accessibilityLabel={suggestion}
                    onPress={() => submit(suggestion)}
                    style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
                  >
                    <Text style={styles.suggestionText}>{suggestion}</Text>
                    <MaterialIcons name="north-east" size={16} color="#2563EB" />
                  </Pressable>
                ))}
              </View>
            </View>
          }
        />

        {failedTurn ? (
          <View style={styles.errorCard} accessibilityRole="alert">
            <MaterialIcons name="error-outline" size={18} color="#C2410C" />
            <View style={styles.errorCopy}>
              <Text style={styles.errorTitle}>Chưa gửi được câu hỏi</Text>
              <Text style={styles.errorText}>
                {askAssistant.error?.message ?? "Hãy kiểm tra mạng rồi gửi lại câu hỏi này."}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Thử lại câu hỏi AI"
              disabled={askAssistant.isPending}
              onPress={() => submit(failedTurn.content, failedTurn.id)}
              style={({ pressed }) => [styles.retry, askAssistant.isPending && styles.retryDisabled, pressed && styles.pressed]}
            >
              <MaterialIcons name="refresh" size={16} color="#9A3412" />
              <Text style={styles.retryText}>Thử lại</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Hỏi Trợ lý AI..."
            placeholderTextColor="#8A96AA"
            multiline
            maxLength={2000}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={() => submit()}
            style={styles.input}
            editable={!askAssistant.isPending}
            accessibilityLabel="Câu hỏi dành cho Trợ lý AI"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Gửi câu hỏi AI"
            onPress={() => submit()}
            disabled={!draft.trim() || askAssistant.isPending}
            style={({ pressed }) => [
              styles.send,
              (!draft.trim() || askAssistant.isPending) && styles.sendDisabled,
              pressed && styles.pressed,
            ]}
          >
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
  heroMark: { width: 46, height: 46, borderRadius: 16, backgroundColor: "#3974F4", alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1 },
  kicker: { fontSize: 10, letterSpacing: 1.4, color: "#9EC2FF", fontWeight: "800" },
  title: { marginTop: 2, color: "#FFFFFF", fontSize: 19, fontWeight: "800" },
  subtitle: { marginTop: 4, color: "#D9E7FF", fontSize: 12.5, lineHeight: 18 },
  list: { flex: 1 },
  listContent: { padding: 16, gap: 10, paddingBottom: 12 },
  emptyList: { flexGrow: 1, padding: 24 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 26 },
  emptyIcon: { width: 70, height: 70, borderRadius: 24, backgroundColor: "#DFE9FF", alignItems: "center", justifyContent: "center" },
  emptyTitle: { marginTop: 16, color: "#162B54", fontSize: 21, fontWeight: "800" },
  emptyBody: { marginTop: 7, maxWidth: 280, color: "#70809A", textAlign: "center", fontSize: 14, lineHeight: 20 },
  suggestionWrap: { width: "100%", maxWidth: 360, marginTop: 20, gap: 8 },
  suggestion: { minHeight: 47, borderWidth: 1, borderColor: "#DCE6FA", borderRadius: 15, backgroundColor: "#FFFFFF", paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  suggestionText: { color: "#1D4ED8", fontWeight: "700", fontSize: 13 },
  bubble: { maxWidth: "86%", paddingHorizontal: 14, paddingVertical: 11, borderRadius: 18 },
  userBubble: { alignSelf: "flex-end", backgroundColor: "#2563EB", borderBottomRightRadius: 5 },
  aiBubble: { alignSelf: "flex-start", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E0E7F3", borderBottomLeftRadius: 5 },
  bubbleLabel: { fontSize: 10.5, fontWeight: "800", marginBottom: 4 },
  userLabel: { color: "#CFE0FF" },
  aiLabel: { color: "#356DE7" },
  bubbleText: { fontSize: 14.5, lineHeight: 21 },
  userText: { color: "#FFFFFF" },
  aiText: { color: "#263653" },
  typingBubble: { flexDirection: "row", gap: 9, alignItems: "center" },
  typingText: { color: "#526985", fontSize: 13, fontStyle: "italic" },
  errorCard: { marginHorizontal: 16, marginTop: 4, padding: 11, borderRadius: 16, borderWidth: 1, borderColor: "#FED7AA", backgroundColor: "#FFF7ED", flexDirection: "row", alignItems: "center", gap: 9 },
  errorCopy: { flex: 1 },
  errorTitle: { color: "#9A3412", fontSize: 12.5, fontWeight: "800" },
  errorText: { marginTop: 2, color: "#C2410C", fontSize: 11.5, lineHeight: 16 },
  retry: { minHeight: 32, paddingHorizontal: 9, borderRadius: 10, backgroundColor: "#FFEDD5", flexDirection: "row", gap: 4, alignItems: "center", justifyContent: "center" },
  retryDisabled: { opacity: 0.55 },
  retryText: { color: "#9A3412", fontSize: 11.5, fontWeight: "800" },
  composer: { marginHorizontal: 16, marginTop: 8, padding: 6, borderWidth: 1, borderColor: "#D9E3F5", borderRadius: 20, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "flex-end", shadowColor: "#123471", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  input: { flex: 1, minHeight: 42, maxHeight: 104, paddingHorizontal: 11, paddingVertical: 9, color: "#172554", fontSize: 15, lineHeight: 20 },
  send: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#2563EB", alignItems: "center", justifyContent: "center" },
  sendDisabled: { backgroundColor: "#9BA9C0" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  notice: { color: "#7B879B", paddingHorizontal: 24, paddingTop: 8, paddingBottom: 10, textAlign: "center", fontSize: 10.5, lineHeight: 15 },
});
