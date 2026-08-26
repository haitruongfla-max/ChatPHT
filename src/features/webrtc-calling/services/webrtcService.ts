// TypeScript cần một entry không hậu tố nền tảng; Metro sẽ chọn
// `webrtcService.native.ts` trên Android và `webrtcService.web.ts` trên web.
export { webrtcService } from "./webrtcService.web";
