import { useEffect } from "react";
import { AppState } from "react-native";

import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Records activity only while the app is in the foreground. This deliberately
 * avoids claiming background availability, so a peer's status remains a recent
 * activity indicator instead of an inaccurate real-time guarantee.
 */
export function PresenceManager() {
  const { user } = useAuth();
  const { mutateAsync: heartbeat } = trpc.presence.heartbeat.useMutation();

  useEffect(() => {
    if (!user) return;

    let active = true;
    const sendHeartbeat = async () => {
      if (!active || AppState.currentState !== "active") return;
      try {
        await heartbeat();
      } catch (error) {
        console.warn("[Presence] Không thể cập nhật hoạt động.", error);
      }
    };

    void sendHeartbeat();
    const interval = setInterval(() => void sendHeartbeat(), HEARTBEAT_INTERVAL_MS);
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") void sendHeartbeat();
    });

    return () => {
      active = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, [heartbeat, user?.id]);

  return null;
}
