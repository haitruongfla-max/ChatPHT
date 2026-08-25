import { NativeModules, Platform } from "react-native";

type AndroidAudioRouteModule = {
  setSpeakerEnabled: (enabled: boolean) => Promise<void>;
  reset: () => Promise<void>;
};

const audioRoute = NativeModules.ChatPHTAudioRoute as AndroidAudioRouteModule | undefined;
const AUDIO_ROUTE_TIMEOUT_MS = 650;

/**
 * The audio-route bridge is only a convenience around WebRTC's own audio
 * session. Some OEM Android builds can leave a native Promise unresolved;
 * never let that optional operation stall media acquisition or negotiation.
 */
async function settleAudioRoute(operation: () => Promise<void>) {
  await Promise.race([
    operation().catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, AUDIO_ROUTE_TIMEOUT_MS)),
  ]);
}

/**
 * Uses Android's communication-device API when the custom native bridge exists.
 * An older installed APK without the bridge still keeps WebRTC's system default route.
 */
export async function setAndroidCallSpeakerRoute(enabled: boolean) {
  if (Platform.OS !== "android" || !audioRoute) return;
  await settleAudioRoute(() => audioRoute.setSpeakerEnabled(enabled));
}

export async function resetAndroidCallSpeakerRoute() {
  if (Platform.OS !== "android" || !audioRoute) return;
  await settleAudioRoute(() => audioRoute.reset());
}
