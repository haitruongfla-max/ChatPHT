import { router, usePathname } from "expo-router";
import { useEffect, useRef } from "react";

import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

/** Foreground-only route gate for the new microphone-only voice flow. */
export function VoiceIncomingWatcher() {
  const { user } = useAuth();
  const pathname = usePathname();
  const openedCallId = useRef<string | null>(null);
  const incoming = trpc.voice.incoming.useQuery(undefined, {
    enabled: Boolean(user),
    refetchInterval: 900,
    retry: false,
  });

  useEffect(() => {
    const call = incoming.data;
    if (!call || pathname === "/voice-call" || openedCallId.current === call.id) return;
    openedCallId.current = call.id;
    router.push({ pathname: "/voice-call", params: { callId: call.id } });
  }, [incoming.data, pathname]);

  useEffect(() => {
    if (!incoming.data) openedCallId.current = null;
  }, [incoming.data]);

  return null;
}
