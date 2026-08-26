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
// Mỗi APK phát hành phải thay giá trị này cùng version/versionCode/tag GitHub.
// Commit chính xác và checksum được công bố cùng asset GitHub Release.
const releaseId = "CPHT-1.0.33-vc37-github-auto-update";

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
  version: "1.0.33",
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
      "NSMicrophoneUsageDescription": "ChatPHT cần micro để quay video có tiếng và gửi media trong cuộc trò chuyện riêng tư.",
      "NSCameraUsageDescription": "ChatPHT cần camera để chụp ảnh và quay video gửi trong cuộc trò chuyện riêng tư."
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
    // versionCode phải tăng để Android có thể cài đè phiên bản đã cài.
    versionCode: 37,
    // Android vẫn buộc người dùng xác nhận cài APK và cho phép nguồn cài đặt nếu cần.
    permissions: ["POST_NOTIFICATIONS", "READ_MEDIA_IMAGES", "READ_MEDIA_VIDEO", "CAMERA", "RECORD_AUDIO", "VIBRATE", "REQUEST_INSTALL_PACKAGES"],
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
  extra: {
    eas: { projectId: expoProjectId },
    releaseId,
  },
  plugins: [
    "expo-router",
    "expo-asset",
    "expo-font",
    "expo-web-browser",
    [
      "expo-camera",
      {
        cameraPermission: "ChatPHT cần camera để bạn chụp ảnh và quay video gửi trong hội thoại riêng tư.",
        microphonePermission: "ChatPHT cần micro để bạn quay video có tiếng gửi trong hội thoại riêng tư.",
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
