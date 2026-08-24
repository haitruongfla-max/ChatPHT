const fs = require("node:fs");
const path = require("node:path");
const {
  createRunOncePlugin,
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require("expo/config-plugins");

const PLUGIN_NAME = "with-chatpht-android-p2p";

function audioRouteModuleSource(packageName) {
  return `package ${packageName}.callaudio

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.ReactPackage
import com.facebook.react.uimanager.ViewManager

/** Routes an active WebRTC call between earpiece and speaker on Android. */
class ChatPHTAudioRouteModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "ChatPHTAudioRoute"

  @ReactMethod
  fun setSpeakerEnabled(enabled: Boolean, promise: Promise) {
    try {
      val audioManager = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val desiredType = if (enabled) AudioDeviceInfo.TYPE_BUILTIN_SPEAKER else AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
        val desiredDevice = audioManager.availableCommunicationDevices.firstOrNull { it.type == desiredType }
        if (desiredDevice != null) {
          audioManager.setCommunicationDevice(desiredDevice)
        } else {
          @Suppress("DEPRECATION")
          audioManager.isSpeakerphoneOn = enabled
        }
      } else {
        @Suppress("DEPRECATION")
        run { audioManager.isSpeakerphoneOn = enabled }
      }
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("AUDIO_ROUTE_ERROR", "Không thể đổi thiết bị âm thanh cuộc gọi.", error)
    }
  }

  @ReactMethod
  fun reset(promise: Promise) {
    try {
      val audioManager = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        audioManager.clearCommunicationDevice()
      }
      @Suppress("DEPRECATION")
      run { audioManager.isSpeakerphoneOn = false }
      audioManager.mode = AudioManager.MODE_NORMAL
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("AUDIO_ROUTE_RESET_ERROR", "Không thể trả lại thiết bị âm thanh hệ thống.", error)
    }
  }
}

class ChatPHTAudioRoutePackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = listOf(ChatPHTAudioRouteModule(reactContext))
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
`;
}

function addMainApplicationHooks(contents, packageName) {
  const audioPackage = `${packageName}.callaudio.ChatPHTAudioRoutePackage`;
  if (!contents.includes(`import ${audioPackage}`)) {
    contents = contents.replace(
      "import android.content.res.Configuration",
      `import android.content.res.Configuration\nimport com.oney.WebRTCModule.WebRTCModuleOptions\nimport ${audioPackage}`,
    );
  }
  if (!contents.includes("add(ChatPHTAudioRoutePackage())")) {
    contents = contents.replace(
      "PackageList(this).packages.apply {",
      "PackageList(this).packages.apply {\n              add(ChatPHTAudioRoutePackage())",
    );
  }
  if (!contents.includes("WebRTCModuleOptions.getInstance().enableMediaProjectionService = true")) {
    contents = contents.replace(
      "override fun onCreate() {\n    super.onCreate()",
      "override fun onCreate() {\n    super.onCreate()\n    // WebRTC starts its Android 14-compatible foreground notification before MediaProjection.\n    WebRTCModuleOptions.getInstance().enableMediaProjectionService = true",
    );
  }
  return contents;
}

function withChatPHTAndroidP2p(config) {
  const packageName = config.android?.package;
  if (!packageName) {
    throw new Error("ChatPHT Android P2P plugin requires android.package.");
  }

  config = withMainApplication(config, (nextConfig) => {
    nextConfig.modResults.contents = addMainApplicationHooks(nextConfig.modResults.contents, packageName);
    return nextConfig;
  });

  config = withAndroidManifest(config, (nextConfig) => {
    const application = nextConfig.modResults.manifest.application?.[0];
    if (!application) throw new Error("Android manifest is missing its application node.");
    const serviceName = "com.oney.WebRTCModule.MediaProjectionService";
    const services = application.service ?? [];
    const service = services.find((candidate) => candidate.$?.["android:name"] === serviceName);
    const attributes = {
      ...(service?.$ ?? {}),
      "android:name": serviceName,
      "android:exported": "false",
      "android:foregroundServiceType": "mediaProjection|microphone|camera",
      "tools:node": "merge",
      "tools:replace": "android:foregroundServiceType,android:exported",
    };
    if (service) service.$ = attributes;
    else services.push({ $: attributes });
    application.service = services;
    return nextConfig;
  });

  config = withDangerousMod(config, ["android", async (nextConfig) => {
    const sourceDirectory = path.join(
      nextConfig.modRequest.platformProjectRoot,
      "app",
      "src",
      "main",
      "java",
      ...packageName.split("."),
      "callaudio",
    );
    fs.mkdirSync(sourceDirectory, { recursive: true });
    fs.writeFileSync(path.join(sourceDirectory, "ChatPHTAudioRoutePackage.kt"), audioRouteModuleSource(packageName));
    return nextConfig;
  }]);

  return config;
}

module.exports = createRunOncePlugin(withChatPHTAndroidP2p, PLUGIN_NAME, "1.0.0");
module.exports.withChatPHTAndroidP2p = withChatPHTAndroidP2p;
module.exports.addMainApplicationHooks = addMainApplicationHooks;
module.exports.audioRouteModuleSource = audioRouteModuleSource;
