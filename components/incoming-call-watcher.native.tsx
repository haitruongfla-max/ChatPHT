import { useEffect, useRef } from "react";
import { router } from "expo-router";

import { trpc } from "@/lib/trpc";

/** Opens the incoming-call screen once per ringing session while the app is active. */
export function IncomingCallWatcher() {
  const handledId = useRef<string | null>(null);
  const incoming = trpc.calls.incoming.useQuery(undefined, { refetchInterval: 1200 });

  useEffect(() => {
    const call = incoming.data;
    if (!call || call.status !== "ringing" || handledId.current === call.id) return;
    handledId.current = call.id;
    router.push({ pathname: "/call", params: { callId: call.id, kind: call.kind, direction: "incoming" } });
  }, [incoming.data]);

  useEffect(() => {
    if (!incoming.data) handledId.current = null;
  }, [incoming.data]);

  return null;
}
