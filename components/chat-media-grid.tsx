import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type ChatGridMedia = {
  id: number;
  contentType: "image" | "video" | "text";
  mediaUrl: string | null;
  mediaCacheKey: string | null;
  mediaName: string | null;
};

export function ChatMediaGrid({
  items,
  onOpen,
}: {
  items: ChatGridMedia[];
  onOpen: (item: ChatGridMedia) => void;
}) {
  const media = items.filter((item) => item.mediaUrl && (item.contentType === "image" || item.contentType === "video"));
  if (media.length === 0) return null;
  const visible = media.slice(0, 9);
  const columns = visible.length === 1 ? 1 : visible.length <= 4 ? 2 : 3;

  return (
    <View style={styles.grid} accessibilityLabel={`Album gồm ${media.length} tệp`}>
      {visible.map((item, index) => {
        const overflow = index === visible.length - 1 ? media.length - visible.length : 0;
        return (
          <Pressable
            key={item.id}
            onPress={() => onOpen(item)}
            style={({ pressed }) => [styles.tile, { width: columns === 1 ? 236 : columns === 2 ? 116 : 76 }, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={item.contentType === "video" ? "Mở video" : "Mở ảnh"}
          >
            <Image
              source={{ uri: item.mediaUrl as string, cacheKey: item.mediaCacheKey ?? `chat-media-${item.id}` }}
              cachePolicy="memory-disk"
              contentFit="cover"
              transition={120}
              style={styles.image}
            />
            {item.contentType === "video" ? <View style={styles.videoBadge}><MaterialIcons name="play-arrow" size={20} color="#FFFFFF" /></View> : null}
            {overflow > 0 ? <View style={styles.overflow}><Text style={styles.overflowText}>+{overflow}</Text></View> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { width: 240, flexDirection: "row", flexWrap: "wrap", gap: 3, overflow: "hidden", borderRadius: 14 },
  tile: { height: 76, overflow: "hidden", backgroundColor: "#0F172A" },
  image: { width: "100%", height: "100%" },
  pressed: { opacity: 0.78 },
  videoBadge: { position: "absolute", left: 7, bottom: 7, width: 27, height: 27, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(15,23,42,0.72)" },
  overflow: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(15,23,42,0.65)" },
  overflowText: { color: "#FFFFFF", fontSize: 22, fontWeight: "700" },
});
