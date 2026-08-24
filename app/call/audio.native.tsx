import { P2pCallScreen } from "@/app/call.native";

/** Voice-only entry point: this route can never request camera or MediaProjection. */
export default function AudioCallRoute() {
  return <P2pCallScreen lockedMode="audio" />;
}
