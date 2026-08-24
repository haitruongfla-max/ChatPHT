import { P2pCallScreen } from "@/app/call.native";

/** Screen-share entry point: MediaProjection is requested only after P2P connects. */
export default function ScreenShareRoute() {
  return <P2pCallScreen lockedMode="screen" />;
}
