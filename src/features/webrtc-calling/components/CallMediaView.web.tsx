import { useEffect, useRef } from "react";

import type { WebRTCMediaStream } from "../types";

/** Trình hiển thị MediaStream browser cho phép thử hai tab mà không thay đổi core. */
export function CallMediaView({
  stream,
  mirror = false,
  style,
}: {
  stream: WebRTCMediaStream | null;
  mirror?: boolean;
  style?: object;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = stream as unknown as MediaStream | null;
    void ref.current.play().catch(() => undefined);
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={mirror}
      style={{ width: "100%", height: "100%", objectFit: "cover", background: "#0F172A", transform: mirror ? "scaleX(-1)" : undefined, ...style }}
    />
  );
}
