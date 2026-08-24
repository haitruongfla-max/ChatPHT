import { P2pCallScreen } from "@/app/call.native";

/** Video-only entry point: this route can never start screen sharing. */
export default function VideoCallRoute() {
  return <P2pCallScreen lockedMode="video" />;
}
