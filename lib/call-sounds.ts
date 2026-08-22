import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { Platform, Vibration } from "react-native";

type CallTonePlayer = Pick<AudioPlayer, "play" | "pause" | "seekTo" | "remove">;

let activeTone: CallTonePlayer | null = null;

/**
 * Creates a compact controllable tone for incoming calls and ringback.
 * A real player is necessary because Android notification sounds cannot be stopped by JavaScript.
 */
export async function createCallTonePlayer(): Promise<CallTonePlayer> {
  if (Platform.OS === "web") {
    return { play: () => undefined, pause: () => undefined, seekTo: () => Promise.resolve(), remove: () => undefined };
  }
  await setAudioModeAsync({ playsInSilentMode: true, interruptionModeAndroid: "duckOthers" });
  const player = createAudioPlayer(require("@/assets/audio/chatpht-call-tone.m4a"), { keepAudioSessionActive: true });
  player.loop = true;
  player.volume = 0.78;
  return player;
}

export function startIncomingCallAlert(player: CallTonePlayer) {
  stopAllCallAlerts();
  activeTone = player;
  player.seekTo(0).catch(() => undefined);
  player.play();
  Vibration.vibrate([0, 500, 350, 500], true);
}

export function stopCallTone(player: CallTonePlayer | null) {
  if (!player) return;
  try {
    player.pause();
    void player.seekTo(0).catch(() => undefined);
    player.remove();
  } catch {
    // A released native player is already in the desired state.
  }
  if (activeTone === player) activeTone = null;
}

/** Stops every app-owned ringing effect synchronously before navigation or a network mutation. */
export function stopAllCallAlerts() {
  Vibration.cancel();
  const player = activeTone;
  activeTone = null;
  stopCallTone(player);
}
