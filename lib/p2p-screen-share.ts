import { mediaDevices, type MediaStream } from "react-native-webrtc";

/** Owns Android MediaProjection only. It never captures microphone or camera media. */
export class P2pScreenShare {
  private stream: MediaStream | null = null;

  async start() {
    await this.stop();

    const getDisplayMedia = (mediaDevices as typeof mediaDevices & {
      getDisplayMedia?: (constraints: { video: boolean; audio: boolean }) => Promise<MediaStream>;
    }).getDisplayMedia;
    if (!getDisplayMedia) throw new Error("Thiết bị không hỗ trợ MediaProjection để chia sẻ màn hình.");

    const stream = await getDisplayMedia({ video: true, audio: false });
    if (stream.getVideoTracks().length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("Android chưa cấp track màn hình. Hãy chấp nhận hộp thoại ghi màn hình rồi thử lại.");
    }

    this.stream = stream;
    stream.getVideoTracks().forEach((track) => {
      track.onended = () => {
        if (this.stream === stream) this.stream = null;
      };
    });
    return stream;
  }

  async stop() {
    const stream = this.stream;
    this.stream = null;
    stream?.getTracks().forEach((track) => track.stop());
  }
}
