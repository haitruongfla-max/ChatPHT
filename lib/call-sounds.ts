import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

type SystemTonePlayer = {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  remove: () => void;
};

/** Uses the operating system notification tone so the app does not bundle a large media file. */
export async function createCallTonePlayer(): Promise<SystemTonePlayer> {
  if (Platform.OS !== "web") {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "ChatPHT",
          body: "Cuộc gọi đang chờ phản hồi",
          sound: "default",
          data: { type: "call_tone" },
        },
        trigger: null,
      });
    } catch {
      // The notification channel still provides the system ringtone when available.
    }
  }
  return {
    play: () => undefined,
    pause: () => undefined,
    seekTo: () => undefined,
    remove: () => undefined,
  };
}

export function stopCallTone(player: SystemTonePlayer | null) {
  if (!player) return;
  try {
    player.pause();
    player.seekTo(0);
    player.remove();
  } catch {
    // A released native player is already in the desired state.
  }
}
