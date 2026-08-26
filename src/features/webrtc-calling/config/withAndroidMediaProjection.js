const {
  AndroidConfig,
  createRunOncePlugin,
  withMainApplication,
} = require("expo/config-plugins");

/**
 * Bật MediaProjection service có sẵn trong react-native-webrtc trước khi module
 * khởi tạo. Không đăng ký service thứ hai để tránh lỗi foreground service cũ.
 */
function withAndroidMediaProjection(config) {
  config = AndroidConfig.Permissions.withPermissions(config, [
    "android.permission.ACCESS_NETWORK_STATE",
    "android.permission.CHANGE_NETWORK_STATE",
    "android.permission.MODIFY_AUDIO_SETTINGS",
    "android.permission.FOREGROUND_SERVICE",
    "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION",
  ]);

  return withMainApplication(config, (mod) => {
    if (mod.modResults.language !== "kt") return mod;
    let contents = mod.modResults.contents;
    if (!contents.includes("import com.oney.WebRTCModule.WebRTCModuleOptions")) {
      contents = contents.replace(/(package[^\n]+\n)/, "$1\nimport com.oney.WebRTCModule.WebRTCModuleOptions\n");
    }
    if (!contents.includes("enableMediaProjectionService = true")) {
      contents = contents.replace(
        /override fun onCreate\(\) \{/, 
        "override fun onCreate() {\n    // ChatPHT: MediaProjection cần foreground service từ react-native-webrtc.\n    WebRTCModuleOptions.getInstance().enableMediaProjectionService = true",
      );
    }
    mod.modResults.contents = contents;
    return mod;
  });
}

module.exports = createRunOncePlugin(withAndroidMediaProjection, "chatpht-webrtc-media-projection", "1.0.0");
