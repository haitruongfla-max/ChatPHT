import { useEffect, useRef } from "react";
import { router } from "expo-router";
import { startIncomingCallAlert, createCallTonePlayer, stopAllCallAlerts, stopCallTone } from "@/lib/call-sounds";
import { claimIncomingCallRoute, releaseIncomingCallRoute } from "@/lib/incoming-call-route-gate";
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
      releaseIncomingCallRoute(handledId.current ?? undefined);
      handledId.current = null;
      stopAllCallAlerts();
      stopCallTone(tone.current);
      tone.current = null;
      return;
    }
    if (!tone.current) {
      void createCallTonePlayer().then((player) => {
        if (incoming.data?.id === call?.id && incoming.data?.status === "ringing") {
          tone.current = player;
          startIncomingCallAlert(player);
        } else {
          stopCallTone(player);
        }
      }).catch(() => undefined);
    }
    if (handledId.current === call?.id) return;
    if (!call?.id || !claimIncomingCallRoute(call.id)) return;
    handledId.current = call?.id ?? null;
    router.push({
      pathname: "/call",
      params: {
        callId: call?.id ?? "",
        kind: call?.kind,
        p2pMode: call?.p2pMode,
        direction: "incoming",
        name: call?.peer?.displayName ?? "Người dùng ChatPHT",
        avatar: call?.peer?.avatarUrl ?? "",
      },
    });
  }, [incoming.data]);

  useEffect(() => () => {
    releaseIncomingCallRoute(handledId.current ?? undefined);
    stopAllCallAlerts();
    stopCallTone(tone.current);
  }, []);

  return null;
}
