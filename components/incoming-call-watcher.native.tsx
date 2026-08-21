import { useEffect, useRef } from "react";
import { router } from "expo-router";
import { Vibration } from "react-native";

import { createCallTonePlayer, stopCallTone } from "@/lib/call-sounds";
import { trpc } from "@/lib/trpc";

/** Opens the incoming-call screen once per ringing session while the app is active. */
export function IncomingCallWatcher() {
  const handledId = useRef<string | null>(null);
  const tone = useRef<Awaited<ReturnType<typeof createCallTonePlayer>> | null>(null);
  const incoming = trpc.calls.incoming.useQuery(undefined, { refetchInterval: 1200 });

  useEffect(() => {
    const call = incoming.data;
    const isRinging = Boolean(call && call.status === "ringing");
    if (!isRinging) {
      Vibration.cancel();
      stopCallTone(tone.current);
      tone.current = null;
      return;
    }
    if (!tone.current) {
      void createCallTonePlayer().then((player) => {
        if (incoming.data?.id === call?.id && incoming.data?.status === "ringing") {
          tone.current = player;
          player.play();
        } else {
          stopCallTone(player);
        }
      }).catch(() => undefined);
      Vibration.vibrate([0, 500, 350, 500], true);
    }
    if (handledId.current === call?.id) return;
    handledId.current = call?.id ?? null;
    router.push({ pathname: "/call", params: { callId: call?.id ?? "", kind: call?.kind, direction: "incoming" } });
  }, [incoming.data]);

  useEffect(() => {
    if (!incoming.data) handledId.current = null;
  }, [incoming.data]);

  useEffect(() => () => {
    Vibration.cancel();
    stopCallTone(tone.current);
  }, []);

  return null;
}
