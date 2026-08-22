import { getApiBaseUrl } from "@/constants/oauth";
import { Image, StyleSheet, Text, View, type ImageStyle, type StyleProp } from "react-native";

export function getProfileAvatarUri(avatarUrl?: string | null) {
  if (!avatarUrl) return null;
  if (/^https?:\/\//i.test(avatarUrl)) return avatarUrl;
  const baseUrl = getApiBaseUrl();
  return baseUrl ? `${baseUrl}${avatarUrl}` : avatarUrl;
}

export function ProfileAvatar({
  name,
  avatarUrl,
  size = 48,
  style,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  const uri = getProfileAvatarUri(avatarUrl);
  const initials = name.trim().slice(0, 1).toUpperCase() || "C";
  const avatarStyle = { width: size, height: size, borderRadius: size / 2 };

  if (uri) return <Image source={{ uri }} style={[styles.image, avatarStyle, style]} accessibilityLabel={`Ảnh đại diện của ${name}`} />;
  return (
    <View style={[styles.fallback, avatarStyle, style]} accessibilityLabel={`Ảnh đại diện mặc định của ${name}`}>
      <Text style={[styles.initials, { fontSize: Math.max(15, Math.round(size * 0.4)) }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: "#DDEBFF" },
  fallback: { alignItems: "center", backgroundColor: "#DDEBFF", justifyContent: "center" },
  initials: { color: "#1558C0", fontWeight: "800" },
});
