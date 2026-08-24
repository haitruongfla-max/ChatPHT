import { NativeModules, Platform } from "react-native";

type AndroidAudioRouteModule = {
  setSpeakerEnabled: (enabled: boolean) => Promise<void>;
  reset: () => Promise<void>;
};

const audioRoute = NativeModules.ChatPHTAudioRoute as AndroidAudioRouteModule | undefined;

/**
 * Uses Android's communication-device API when the custom native bridge exists.
 * An older installed APK without the bridge still keeps WebRTC's system default route.
 */
export async function setAndroidCallSpeakerRoute(enabled: boolean) {
  if (Platform.OS !== "android" || !audioRoute) return;
  await audioRoute.setSpeakerEnabled(enabled);
}

export async function resetAndroidCallSpeakerRoute() {
  if (Platform.OS !== "android" || !audioRoute) return;
  await audioRoute.reset();
}
