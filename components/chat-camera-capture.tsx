import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
} from "expo-camera";
import { useEffect, useRef, useState } from "react";
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

export type ChatCameraCaptureMode = "image" | "video";

export type CapturedChatMedia = {
  uri: string;
  type: ChatCameraCaptureMode;
};

type ChatCameraCaptureProps = {
  mode: ChatCameraCaptureMode | null;
  onClose: () => void;
  onCaptured: (media: CapturedChatMedia) => void | Promise<void>;
};

/** Full-screen camera used only while the user explicitly captures chat media. */
export function ChatCameraCapture({ mode, onClose, onCaptured }: ChatCameraCaptureProps) {
  const cameraRef = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [preparing, setPreparing] = useState(false);
  const [recording, setRecording] = useState(false);

  const requiresMicrophone = mode === "video";
  const hasPermissions = Boolean(cameraPermission?.granted && (!requiresMicrophone || microphonePermission?.granted));

  useEffect(() => {
    if (!mode) return;
    void (async () => {
      const camera = cameraPermission?.granted
        ? cameraPermission
        : await requestCameraPermission();
      if (!camera.granted) return;
      if (mode === "video" && !microphonePermission?.granted) {
        await requestMicrophonePermission();
      }
    })();
  }, [cameraPermission, microphonePermission, mode, requestCameraPermission, requestMicrophonePermission]);

  useEffect(() => () => cameraRef.current?.stopRecording(), []);

  if (!mode) return null;

  const close = () => {
    if (recording) cameraRef.current?.stopRecording();
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

  const toggleRecording = async () => {
    if (!cameraRef.current || preparing) return;
    if (recording) {
      cameraRef.current.stopRecording();
      return;
    }

    try {
      setRecording(true);
      const video = await cameraRef.current.recordAsync({
        maxDuration: 300,
      });
      if (video?.uri) await completeCapture({ uri: video.uri, type: "video" });
    } catch (error) {
      Alert.alert("Không thể quay video", error instanceof Error ? error.message : "Vui lòng thử lại.");
    } finally {
      setRecording(false);
    }
  };

  const requestPermissionsAgain = async () => {
    const camera = await requestCameraPermission();
    if (camera.granted && requiresMicrophone) await requestMicrophonePermission();
  };

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
      <View style={styles.root}>
        {hasPermissions ? (
          <CameraView ref={cameraRef} style={styles.camera} facing={facing} />
        ) : (
          <View style={styles.permissionCard}>
            <MaterialIcons name="camera-alt" size={36} color="#BFDBFE" />
            <Text style={styles.permissionTitle}>Cần quyền camera{requiresMicrophone ? " và microphone" : ""}</Text>
            <Text style={styles.permissionText}>
              ChatPHT chỉ dùng quyền này khi bạn chủ động chụp ảnh hoặc quay video để gửi trong cuộc trò chuyện.
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
              <MaterialIcons name={mode === "video" ? "videocam" : "photo-camera"} size={17} color="#FFFFFF" />
              <Text style={styles.modeText}>{mode === "video" ? "Quay video HD" : "Chụp ảnh"}</Text>
            </View>
          </View>
          {hasPermissions ? (
            <View style={styles.bottomBar}>
              <Pressable onPress={() => setFacing((current) => current === "back" ? "front" : "back")} disabled={preparing || recording} style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]} accessibilityLabel="Đổi camera trước hoặc sau">
                <MaterialIcons name="flip-camera-android" size={25} color="#FFFFFF" />
              </Pressable>
              <Pressable onPress={() => void (mode === "video" ? toggleRecording() : takePhoto())} disabled={preparing} style={({ pressed }) => [styles.captureButton, mode === "video" && recording && styles.captureButtonRecording, pressed && styles.pressed]} accessibilityLabel={mode === "video" ? (recording ? "Dừng quay video" : "Bắt đầu quay video") : "Chụp ảnh"}>
                {preparing ? <ActivityIndicator color="#FFFFFF" /> : <View style={[styles.captureCenter, mode === "video" && recording && styles.captureCenterRecording]} />}
              </Pressable>
              <View style={styles.roundButton} pointerEvents="none">
                {mode === "video" && recording ? <Text style={styles.recordingText}>REC</Text> : <MaterialIcons name="hd" size={22} color="#FFFFFF" />}
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
  captureButton: { height: 74, width: 74, borderRadius: 37, padding: 5, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.95)" },
  captureButtonRecording: { backgroundColor: "#FEE2E2" },
  captureCenter: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#FFFFFF", borderWidth: 3, borderColor: "#2563EB" },
  captureCenterRecording: { width: 28, height: 28, borderRadius: 6, backgroundColor: "#DC2626", borderWidth: 0 },
  recordingText: { color: "#FECACA", fontSize: 10, fontWeight: "900" },
  permissionCard: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 36, backgroundColor: "#0F172A" },
  permissionTitle: { marginTop: 14, color: "#F8FAFC", fontSize: 19, fontWeight: "800", textAlign: "center" },
  permissionText: { marginTop: 9, color: "#CBD5E1", fontSize: 14, lineHeight: 20, textAlign: "center" },
  permissionButton: { marginTop: 22, minHeight: 46, paddingHorizontal: 20, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#2563EB" },
  permissionButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  pressed: { opacity: 0.7 },
});
