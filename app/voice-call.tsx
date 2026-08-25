import type { ComponentType } from "react";
import { Platform } from "react-native";

import VoiceCallWebFallback from "./voice-call.web";

/**
 * Expo Router requires this platform-neutral route for typed navigation.
 * The native screen is loaded only at runtime on Android, keeping the web
 * preview clear of the react-native-webrtc native view implementation.
 */
export default function VoiceCallRoute() {
  if (Platform.OS === "web") {
    return <VoiceCallWebFallback />;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports -- must not bundle native WebRTC into web preview
  const VoiceCallNativeScreen = require("@/components/voice-call-screen.native")
    .default as ComponentType;
  return <VoiceCallNativeScreen />;
}
