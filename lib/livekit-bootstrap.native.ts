import { registerGlobals } from "@livekit/react-native";

let registered = false;

/** Registers the WebRTC globals once, before any Room is created on iOS/Android. */
export function ensureLiveKitGlobals() {
  if (registered) return;
  registerGlobals();
  registered = true;
}

ensureLiveKitGlobals();
