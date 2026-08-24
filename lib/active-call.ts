import type { P2pCall } from "@/lib/p2p-call";

export type ActiveCallSnapshot = {
  callId: string;
  kind: "audio" | "video";
  direction: "incoming" | "outgoing";
  name: string;
  isGroup: false;
  provider: "p2p";
  call: P2pCall;
  connected: boolean;
  minimized: boolean;
  muted: boolean;
  speaker: boolean;
  cameraOn: boolean;
  isFrontCamera: boolean;
  videoQuality: "sd" | "hd";
  seconds: number;
};

type ActiveCallPatch = Partial<Omit<ActiveCallSnapshot, "callId" | "call">>;
type Listener = (snapshot: ActiveCallSnapshot | null) => void;

let snapshot: ActiveCallSnapshot | null = null;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener(snapshot));
}

export const activeCall = {
  get(callId?: string) {
    if (!snapshot || (callId && snapshot.callId !== callId)) return null;
    return snapshot;
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  activate(next: Omit<ActiveCallSnapshot, "minimized"> & { minimized?: boolean }) {
    snapshot = { ...next, minimized: next.minimized ?? false };
    emit();
  },
  update(callId: string, patch: ActiveCallPatch) {
    if (!snapshot || snapshot.callId !== callId) return;
    snapshot = { ...snapshot, ...patch };
    emit();
  },
  minimize(callId: string) { this.update(callId, { minimized: true }); },
  restore(callId: string) { this.update(callId, { minimized: false }); },
  isMinimized(callId: string) { return snapshot?.callId === callId && snapshot.minimized; },
  clear(callId?: string) {
    if (callId && snapshot?.callId !== callId) return;
    snapshot = null;
    emit();
  },
};
