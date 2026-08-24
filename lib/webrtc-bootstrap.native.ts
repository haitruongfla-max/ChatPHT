import { registerGlobals } from "react-native-webrtc";

let registered = false;

/** Registers native WebRTC globals once before any 1:1 P2P peer connection is created. */
export function ensureWebRtcGlobals() {
  if (registered) return;
  registerGlobals();
  registered = true;
}

ensureWebRtcGlobals();
