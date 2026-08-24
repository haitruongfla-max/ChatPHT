import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
} from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";
import * as VideoThumbnails from "expo-video-thumbnails";
import { useEffect, useRef, useState } from "react";
import Svg, { Circle } from "react-native-svg";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export type CapturedChatMedia = {
  uri: string;
  type: "image" | "video";
  thumbnailUri?: string;
};

const MAX_RECORDING_SECONDS = 300;
const MIN_RECORDING_MILLISECONDS = 2_500;
const CAPTURE_PROGRESS_RADIUS = 32;
const CAPTURE_PROGRESS_CIRCUMFERENCE = 2 * Math.PI * CAPTURE_PROGRESS_RADIUS;

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function formatCaptureDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.min(MAX_RECORDING_SECONDS, Math.floor(seconds)));
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, "0")}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

type ChatCameraCaptureProps = {
  visible: boolean;
  onClose: () => void;
  onCaptured: (media: CapturedChatMedia) => void | Promise<void>;
};

/** Full-screen camera used only while the user explicitly captures chat media. */
export function ChatCameraCapture({ visible, onClose, onCaptured }: ChatCameraCaptureProps) {
  const cameraRef = useRef<CameraView>(null);
  const recordingStartedAt = useRef<number | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingRef = useRef(false);
  const recordingRequested = useRef(false);
  const stopRequested = useRef(false);
  const closing = useRef(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [cameraMode, setCameraMode] = useState<"picture" | "video">("picture");
  const [preparing, setPreparing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const hasCameraPermission = Boolean(cameraPermission?.granted);
  const safeRecordingSeconds = Math.min(MAX_RECORDING_SECONDS, recordingSeconds);
  const recordingProgress = safeRecordingSeconds / MAX_RECORDING_SECONDS;
  const recordingRemainingSeconds = MAX_RECORDING_SECONDS - safeRecordingSeconds;

  useEffect(() => {
    if (!visible) return;
    void (async () => {
      const camera = cameraPermission?.granted
        ? cameraPermission
        : await requestCameraPermission();
      if (!camera.granted) return;
    })();
  }, [cameraPermission, requestCameraPermission, visible]);

  useEffect(() => {
    if (!recording || recordingStartedAt.current === null) return;
    const interval = setInterval(() => {
      setRecordingSeconds(Math.floor((Date.now() - (recordingStartedAt.current ?? Date.now())) / 1000));
    }, 250);
    return () => clearInterval(interval);
  }, [recording]);

  useEffect(() => () => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    if (holdTimer.current) clearTimeout(holdTimer.current);
    cameraRef.current?.stopRecording();
  }, []);

  if (!visible) return null;

  const close = () => {
    closing.current = true;
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (recordingRef.current) cameraRef.current?.stopRecording();
    onClose();
  };

  const completeCapture = async (media: CapturedChatMedia) => {
    setPreparing(true);
    try {
      await onCaptured(media);
    } finally {
      setPreparing(false);
    }
  };

  const takePhoto = async () => {
    if (!cameraRef.current || preparing) return;
    try {
      setPreparing(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.82,
        base64: false,
        skipProcessing: false,
      });
      if (!photo?.uri) throw new Error("Camera không trả về ảnh hợp lệ.");
      await onCaptured({ uri: photo.uri, type: "image" });
    } catch (error) {
      Alert.alert("Không thể chụp ảnh", error instanceof Error ? error.message : "Vui lòng thử lại.");
    } finally {
      setPreparing(false);
    }
  };

  const stopRecordingWhenReady = () => {
    stopRequested.current = true;
    if (!cameraRef.current || !recordingRef.current) return;
    const elapsed = Date.now() - (recordingStartedAt.current ?? Date.now());
    // Xiaomi encoders can expose recordAsync before the first key frame is committed.
    // Never stop until the video CameraView has had a full encoder/keyframe window.
    const remaining = Math.max(0, MIN_RECORDING_MILLISECONDS - elapsed);
    if (remaining > 0) {
      if (!stopTimer.current) {
        stopTimer.current = setTimeout(() => {
          stopTimer.current = null;
          cameraRef.current?.stopRecording();
        }, remaining);
      }
      return;
    }
    cameraRef.current.stopRecording();
  };

  const startRecording = async () => {
    if (!cameraRef.current || preparing || !cameraReady || recordingRef.current || !recordingRequested.current || cameraMode !== "video") return;

    try {
      const microphone = microphonePermission?.granted
        ? microphonePermission
        : await requestMicrophonePermission();
      if (!microphone.granted) {
        Alert.alert("Cần quyền microphone", "Hãy cho phép microphone để quay video có tiếng.");
        return;
      }
      closing.current = false;
      recordingStartedAt.current = Date.now();
      setRecordingSeconds(0);
      recordingRef.current = true;
      setRecording(true);
      if (stopRequested.current) stopRecordingWhenReady();
      // SDK 54 documents `quality`; its local declaration currently omits this Android runtime option.
      const recordingOptions = {
        maxDuration: MAX_RECORDING_SECONDS,
        quality: "720p",
        mute: false,
      } as unknown as Parameters<CameraView["recordAsync"]>[0];
      const video = await cameraRef.current.recordAsync(recordingOptions);
      if (!video?.uri) throw new Error("Camera không trả về tệp video hợp lệ.");
      const videoDirectory = FileSystem.cacheDirectory ? `${FileSystem.cacheDirectory}chatpht-videos/` : null;
      if (videoDirectory) {
        await FileSystem.makeDirectoryAsync(videoDirectory, { intermediates: true });
      }
      const persistentVideoUri = videoDirectory
        ? `${videoDirectory}chatpht-video-${Date.now()}.mp4`
        : video.uri;
      if (persistentVideoUri !== video.uri) {
        await FileSystem.copyAsync({ from: video.uri, to: persistentVideoUri });
      }
      // Give Android a brief chance to flush the MP4 atom after recordAsync resolves.
      await wait(250);
      const info = await FileSystem.getInfoAsync(persistentVideoUri);
      const byteSize = info.exists && "size" in info ? info.size : 0;
      if (!byteSize || byteSize < 2048) {
        throw new Error("Video chưa kịp tạo dữ liệu. Vui lòng quay ít nhất vài giây rồi dừng.");
      }
      let thumbnailUri: string | undefined;
      try {
        const recordedDurationSeconds = Math.max(
          0,
          Math.floor((Date.now() - (recordingStartedAt.current ?? Date.now())) / 1000),
        );
        const thumbnail = await VideoThumbnails.getThumbnailAsync(persistentVideoUri, {
          time: Math.min(1000, Math.max(0, recordedDurationSeconds * 1000)),
          quality: 0.7,
        });
        thumbnailUri = thumbnail.uri;
      } catch {
        // The MP4 remains valid even if a device cannot decode a preview frame immediately.
      }
      if (!closing.current) await completeCapture({ uri: persistentVideoUri, type: "video", thumbnailUri });
    } catch (error) {
      if (!closing.current) Alert.alert("Không thể quay video", error instanceof Error ? error.message : "Vui lòng thử lại.");
    } finally {
      recordingStartedAt.current = null;
      recordingRef.current = false;
      recordingRequested.current = false;
      stopRequested.current = false;
      if (stopTimer.current) clearTimeout(stopTimer.current);
      stopTimer.current = null;
      setRecording(false);
      setRecordingSeconds(0);
      setCameraMode("picture");
    }
  };

  const beginVideoMode = () => {
    if (preparing || recordingRef.current || recordingRequested.current) return;
    recordingRequested.current = true;
    stopRequested.current = false;
    // CameraView must complete a mode change before recordAsync is invoked.
    // Calling it while a picture session is still configuring produces empty files on some Android devices.
    setCameraReady(false);
    setCameraMode("video");
  };

  const handleCameraReady = () => {
    setCameraReady(true);
    if (cameraMode === "video" && recordingRequested.current) {
      void startRecording();
    }
  };

  const handleCapturePressIn = () => {
    if (preparing || !cameraReady) return;
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      beginVideoMode();
    }, 300);
  };

  const handleCapturePressOut = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
      void takePhoto();
      return;
    }
    if (recordingRequested.current && !recordingRef.current) {
      // The finger was released while CameraView was switching into video mode.
      // Keep the request: startRecording will honor this deferred stop after its safe window.
      stopRequested.current = true;
      return;
    }
    stopRecordingWhenReady();
  };

  const requestPermissionsAgain = async () => {
    await requestCameraPermission();
  };

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
      <View style={styles.root}>
        {hasCameraPermission ? (
          <CameraView ref={cameraRef} style={styles.camera} facing={facing} mode={cameraMode} onCameraReady={handleCameraReady} />
        ) : (
          <View style={styles.permissionCard}>
            <MaterialIcons name="camera-alt" size={36} color="#BFDBFE" />
            <Text style={styles.permissionTitle}>Cần quyền camera</Text>
            <Text style={styles.permissionText}>
              ChatPHT chỉ dùng camera khi bạn chủ động chụp ảnh hoặc quay video để gửi trong cuộc trò chuyện.
            </Text>
            <Pressable onPress={() => void requestPermissionsAgain()} style={({ pressed }) => [styles.permissionButton, pressed && styles.pressed]}>
              <Text style={styles.permissionButtonText}>Cho phép</Text>
            </Pressable>
          </View>
        )}
        <SafeAreaView style={styles.overlay} edges={["top", "bottom", "left", "right"]} pointerEvents="box-none">
          <View style={styles.topBar}>
            <Pressable onPress={close} disabled={preparing} style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]} accessibilityLabel="Đóng camera">
              <MaterialIcons name="close" size={25} color="#FFFFFF" />
            </Pressable>
            <View style={styles.modeBadge}>
              <MaterialIcons name="photo-camera" size={17} color="#FFFFFF" />
              <Text style={styles.modeText}>Chạm chụp · Giữ quay HD</Text>
            </View>
          </View>
          {recording ? (
            <View style={styles.recordingTimer} accessibilityLiveRegion="polite">
              <Text style={styles.recordingTimerPrimary}>{`REC ${formatCaptureDuration(safeRecordingSeconds)} / 05:00`}</Text>
              <Text style={styles.recordingTimerSecondary}>{`Còn ${formatCaptureDuration(recordingRemainingSeconds)}`}</Text>
            </View>
          ) : null}
          {hasCameraPermission ? (
            <View style={styles.bottomBar}>
              <Pressable onPress={() => setFacing((current) => current === "back" ? "front" : "back")} disabled={preparing || recording} style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]} accessibilityLabel="Đổi camera trước hoặc sau">
                <MaterialIcons name="flip-camera-android" size={25} color="#FFFFFF" />
              </Pressable>
              <Pressable onPressIn={handleCapturePressIn} onPressOut={handleCapturePressOut} disabled={preparing || !cameraReady} style={({ pressed }) => [styles.captureButton, recording && styles.captureButtonRecording, (!cameraReady || preparing) && styles.captureButtonDisabled, pressed && styles.pressed]} accessibilityLabel="Chạm để chụp ảnh, giữ để quay video tối đa năm phút">
                {preparing ? <ActivityIndicator color="#FFFFFF" /> : (
                  <View style={styles.captureProgressWrap}>
                    {recording ? (
                      <Svg width={74} height={74} style={styles.captureProgress} accessibilityLabel="Tiến trình quay video">
                        <Circle
                          cx={37}
                          cy={37}
                          r={CAPTURE_PROGRESS_RADIUS}
                          stroke="#DC2626"
                          strokeWidth={4}
                          fill="transparent"
                          strokeLinecap="round"
                          strokeDasharray={CAPTURE_PROGRESS_CIRCUMFERENCE}
                          strokeDashoffset={CAPTURE_PROGRESS_CIRCUMFERENCE * (1 - recordingProgress)}
                          rotation={-90}
                          origin="37, 37"
                        />
                      </Svg>
                    ) : null}
                    <View style={[styles.captureCenter, recording && styles.captureCenterRecording]} />
                  </View>
                )}
              </Pressable>
              <View style={styles.roundButton} pointerEvents="none">
                <MaterialIcons name="hd" size={22} color="#FFFFFF" />
              </View>
            </View>
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#030712" },
  camera: { ...StyleSheet.absoluteFillObject },
  overlay: { flex: 1, justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bottomBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: Platform.OS === "android" ? 8 : 0 },
  roundButton: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(15, 23, 42, 0.62)" },
  modeBadge: { minHeight: 38, paddingHorizontal: 13, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(15, 23, 42, 0.70)" },
  modeText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  recordingTimer: { alignSelf: "center", marginTop: 13, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 13, alignItems: "center", backgroundColor: "rgba(127, 29, 29, 0.88)" },
  recordingTimerPrimary: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  recordingTimerSecondary: { color: "#FECACA", fontSize: 11.5, fontWeight: "700", marginTop: 2 },
  captureButton: { height: 74, width: 74, borderRadius: 37, padding: 5, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.95)" },
  captureButtonRecording: { backgroundColor: "#FEE2E2" },
  captureButtonDisabled: { opacity: 0.55 },
  captureProgressWrap: { height: 74, width: 74, alignItems: "center", justifyContent: "center" },
  captureProgress: { position: "absolute" },
  captureCenter: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#FFFFFF", borderWidth: 3, borderColor: "#2563EB" },
  captureCenterRecording: { width: 28, height: 28, borderRadius: 6, backgroundColor: "#DC2626", borderWidth: 0 },
  permissionCard: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 36, backgroundColor: "#0F172A" },
  permissionTitle: { marginTop: 14, color: "#F8FAFC", fontSize: 19, fontWeight: "800", textAlign: "center" },
  permissionText: { marginTop: 9, color: "#CBD5E1", fontSize: 14, lineHeight: 20, textAlign: "center" },
  permissionButton: { marginTop: 22, minHeight: 46, paddingHorizontal: 20, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#2563EB" },
  permissionButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  pressed: { opacity: 0.7 },
});
