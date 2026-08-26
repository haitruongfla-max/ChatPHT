import { createAudioPlayer, setAudioModeAsync } from "expo-audio";

type ToneKind = "incoming" | "outgoing";

let player: ReturnType<typeof createAudioPlayer> | null = null;
let activeTone: ToneKind | null = null;

const SOURCES: Record<ToneKind, number> = {
  incoming: require("../../../../assets/sounds/chatpht-incoming-ringtone.wav"),
  outgoing: require("../../../../assets/sounds/chatpht-outgoing-ringback.wav"),
};

/** Dùng một player độc quyền để ringtone/ringback không chồng lên nhau và luôn được giải phóng. */
export const callToneManager = {
  async start(kind: ToneKind) {
    if (activeTone === kind && player?.playing) return;
    await this.stop();
    try {
      await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false });
      const next = createAudioPlayer(SOURCES[kind], { downloadFirst: true });
      next.loop = true;
      next.volume = kind === "incoming" ? 0.9 : 0.55;
      next.play();
      player = next;
      activeTone = kind;
    } catch {
      // Không để âm báo khiến lời mời hay thao tác nhận/từ chối cuộc gọi bị chặn.
      player?.remove();
      player = null;
      activeTone = null;
    }
  },
  async stop() {
    const current = player;
    player = null;
    activeTone = null;
    if (!current) return;
    try {
      current.pause();
      await current.seekTo(0);
    } catch {
      // remove vẫn phải được gọi khi native player đã đổi trạng thái.
    }
    current.remove();
  },
};
