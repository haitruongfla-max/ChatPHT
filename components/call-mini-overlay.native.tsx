import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { activeCall, type ActiveCallSnapshot } from "@/lib/active-call";
import { p2pCallRoute } from "@/lib/p2p-call-route";
import { trpc } from "@/lib/trpc";

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  return `${minutes}:${(seconds % 60).toString().padStart(2, "0")}`;
}

/** Keeps an in-progress call available while the user returns to ChatPHT. */
export function CallMiniOverlay() {
  const insets = useSafeAreaInsets();
  const [snapshot, setSnapshot] = useState<ActiveCallSnapshot | null>(() => activeCall.get());
  const end = trpc.calls.end.useMutation();

  useEffect(() => {
    const unsubscribe = activeCall.subscribe(setSnapshot);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!snapshot?.minimized || !snapshot.connected) return;
    const timer = setInterval(() => {
      const current = activeCall.get(snapshot.callId);
      if (current?.minimized && current.connected) {
        activeCall.update(current.callId, { seconds: current.seconds + 1 });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [snapshot?.callId, snapshot?.connected, snapshot?.minimized]);

  if (!snapshot?.minimized || !snapshot.connected) return null;

  const restore = () => {
    activeCall.restore(snapshot.callId);
    router.push({
      pathname: p2pCallRoute(snapshot.p2pMode) as never,
      params: {
        callId: snapshot.callId,
        kind: snapshot.kind,
        p2pMode: snapshot.p2pMode,
        direction: snapshot.direction,
        name: snapshot.name,
      },
    });
  };

  const finish = async () => {
    try {
      await end.mutateAsync({ callId: snapshot.callId });
    } catch {
      // Always release local media even if the status request has timed out.
    } finally {
      await snapshot.call.disconnect().catch(() => undefined);
      activeCall.clear(snapshot.callId);
    }
  };

  return (
    <View style={[styles.card, { bottom: Math.max(insets.bottom + 64, 82) }]}>
      <Pressable
        onPress={restore}
        style={({ pressed }) => [styles.restore, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Mở rộng cuộc gọi đang diễn ra"
      >
        <View style={styles.icon}>
          <MaterialIcons name={snapshot.p2pMode === "screen" ? "screen-share" : snapshot.p2pMode === "video" ? "videocam" : "phone"} size={22} color="#DBEAFE" />
        </View>
        <View style={styles.texts}>
          <Text numberOfLines={1} style={styles.name}>{snapshot.name}</Text>
        <Text style={styles.status}>P2P bảo mật · {formatDuration(snapshot.seconds)}</Text>
        </View>
        <MaterialIcons name="open-in-full" size={18} color="#AAC9FF" />
      </Pressable>
      <Pressable
        onPress={() => void finish()}
        disabled={end.isPending}
        style={({ pressed }) => [styles.end, (pressed || end.isPending) && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Kết thúc cuộc gọi"
      >
        <MaterialIcons name="call-end" size={21} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    left: 16,
    right: 16,
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    backgroundColor: "#12213B",
    borderWidth: 1,
    borderColor: "#2E4F83",
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOpacity: 0.28,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  restore: { flex: 1, minHeight: 68, flexDirection: "row", alignItems: "center", paddingLeft: 12, gap: 10 },
  icon: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#28497D", alignItems: "center", justifyContent: "center" },
  texts: { flex: 1, minWidth: 0 },
  name: { color: "#F8FBFF", fontSize: 15, fontWeight: "800" },
  status: { color: "#B8CAF0", fontSize: 12, marginTop: 3 },
  end: { alignSelf: "stretch", width: 62, alignItems: "center", justifyContent: "center", backgroundColor: "#E84B58" },
  pressed: { opacity: 0.72 },
});
