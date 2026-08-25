// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

// Bundle ID format: space.manus.<project_name_dots>.<timestamp>
// e.g., "my-app" created at 2024-01-15 10:30:45 -> "space.manus.my.app.t20240115103045"
// Bundle ID can only contain letters, numbers, and dots
// Android requires each dot-separated segment to start with a letter
const rawBundleId = "com.app.swiftchat";
const bundleId =
  rawBundleId
    .replace(/[-_]/g, ".") // Replace hyphens/underscores with dots
    .replace(/[^a-zA-Z0-9.]/g, "") // Remove invalid chars
    .replace(/\.+/g, ".") // Collapse consecutive dots
    .replace(/^\.+|\.+$/g, "") // Trim leading/trailing dots
    .toLowerCase()
    .split(".")
    .map((segment) => {
      // Android requires each segment to start with a letter
      // Prefix with 'x' if segment starts with a digit
      return /^[a-zA-Z]/.test(segment) ? segment : "x" + segment;
    })
    .join(".") || "space.manus.app";
// Extract timestamp from bundle ID and prefix with "manus" for deep link scheme
// e.g., "space.manus.my.app.t20240115103045" -> "manus20240115103045"
const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `manus${timestamp}`;
const expoProjectId =
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
  "313af748-4c54-4949-8389-71ee2772b17a";

const env = {
  // App branding - update these values directly (do not use env vars)
  appName: "ChatPHT",
  appSlug: "chatpht",
  // S3 URL of the app logo - set this to the URL returned by generate_image when creating custom logo
  // Leave empty to use the default icon from assets/images/icon.png
  logoUrl: "/manus-storage/chatpht-icon_c9ee6eac.png",
  scheme: schemeFromBundleId,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  owner: "truongbbbs-team",
  version: "1.0.27",
  runtimeVersion: {
    // Bất kỳ thay đổi native nào sẽ có runtime mới, chặn OTA không tương thích.
    policy: "fingerprint",
  },
  updates: {
    url: `https://u.expo.dev/${expoProjectId}`,
    checkAutomatically: "ON_LOAD",
    fallbackToCacheTimeout: 30_000,
  },
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    "infoPlist": {
      "ITSAppUsesNonExemptEncryption": false,
      "NSPhotoLibraryUsageDescription": "ChatPHT cần truy cập thư viện để bạn gửi ảnh và video trong cuộc trò chuyện riêng tư.",
      "NSPhotoLibraryAddUsageDescription": "ChatPHT cần quyền thêm ảnh và video bạn chọn lưu vào thư viện điện thoại.",
      "NSMicrophoneUsageDescription": "ChatPHT cần micro để bạn thực hiện cuộc gọi thoại và video riêng tư.",
      "NSCameraUsageDescription": "ChatPHT cần camera để bạn thực hiện cuộc gọi video riêng tư."
    }
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    googleServicesFile: "./google-services.json",
    // versionCode phải tăng để Android có thể cài đè bản kiểm chứng P2P trước đó.
    versionCode: 31,
    permissions: ["POST_NOTIFICATIONS", "READ_MEDIA_IMAGES", "READ_MEDIA_VIDEO", "CAMERA", "RECORD_AUDIO", "MODIFY_AUDIO_SETTINGS", "BLUETOOTH_CONNECT", "VIBRATE", "REQUEST_IGNORE_BATTERY_OPTIMIZATIONS", "FOREGROUND_SERVICE", "FOREGROUND_SERVICE_MEDIA_PROJECTION", "FOREGROUND_SERVICE_MICROPHONE", "FOREGROUND_SERVICE_CAMERA"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: env.scheme,
            host: "*",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    // Chế độ preview cần Metro duy trì dev server thay vì chạy export tĩnh rồi thoát.
    output: "single",
    favicon: "./assets/images/favicon.png",
  },
  extra: { eas: { projectId: expoProjectId } },
  plugins: [
    "expo-router",
    "expo-asset",
    "expo-font",
    "expo-web-browser",
    [
      "@config-plugins/react-native-webrtc",
      {
        cameraPermission: "ChatPHT cần camera để bạn gọi video 1:1.",
        microphonePermission: "ChatPHT cần micro để bạn gọi thoại, gọi video và chia sẻ màn hình 1:1.",
      },
    ],
    "./plugins/with-chatpht-android-p2p",
    [
      "expo-camera",
      {
        cameraPermission: "ChatPHT cần camera để bạn gọi video, chụp ảnh và quay video gửi trong hội thoại riêng tư.",
        microphonePermission: "ChatPHT cần micro để bạn gọi thoại, gọi video và quay video có tiếng.",
        recordAudioAndroid: true,
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/images/icon.png",
        color: "#2563EB",
        defaultChannel: "messages",
      },
    ],
    [
      "expo-media-library",
      {
        photosPermission: "ChatPHT cần quyền truy cập thư viện để bạn chọn ảnh và video trong hội thoại riêng tư.",
        savePhotosPermission: "ChatPHT cần quyền thêm ảnh và video bạn chọn lưu vào thư viện điện thoại.",
        granularPermissions: ["photo", "video"],
      },
    ],
    [
      "expo-audio",
      {
        microphonePermission: "Allow $(PRODUCT_NAME) to access your microphone.",
      },
    ],
    [
      "expo-video",
      {
        supportsBackgroundPlayback: true,
        supportsPictureInPicture: true,
      },
    ],
    ["expo-pip", {}],
    [
      "expo-image-picker",
      {
        photosPermission: "ChatPHT cần truy cập thư viện để bạn gửi ảnh và video trong cuộc trò chuyện riêng tư.",
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          backgroundColor: "#000000",
        },
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a"],
          minSdkVersion: 24,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
