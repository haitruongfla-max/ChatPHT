import Constants from "expo-constants";
import * as IntentLauncher from "expo-intent-launcher";
import { Platform } from "react-native";

type AutoStartIntent = { packageName: string; className: string };

export type BackgroundCallSettingsResult = {
  openedBatterySettings: boolean;
  openedAutoStartSettings: boolean;
};

export function getAutoStartIntentForBrand(brand?: string, manufacturer?: string): AutoStartIntent | null {
  const device = `${brand ?? ""} ${manufacturer ?? ""}`.toLowerCase();
  if (device.includes("xiaomi") || device.includes("redmi") || device.includes("poco")) {
    return { packageName: "com.miui.securitycenter", className: "com.miui.permcenter.autostart.AutoStartManagementActivity" };
  }
  if (device.includes("oppo")) {
    return { packageName: "com.coloros.safecenter", className: "com.coloros.safecenter.permission.startup.StartupAppListActivity" };
  }
  return null;
}

function getPackageName() {
  return Constants.expoConfig?.android?.package ?? "com.app.swiftchat";
}

export async function openBackgroundCallSettings(): Promise<BackgroundCallSettingsResult> {
  if (Platform.OS !== "android") return { openedBatterySettings: false, openedAutoStartSettings: false };

  let openedBatterySettings = false;
  let openedAutoStartSettings = false;
  try {
    await IntentLauncher.startActivityAsync("android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS", { data: `package:${getPackageName()}` });
    openedBatterySettings = true;
  } catch {
    return { openedBatterySettings, openedAutoStartSettings };
  }

  const constants = Platform.constants as { Brand?: string; Manufacturer?: string };
  const autoStartIntent = getAutoStartIntentForBrand(constants.Brand, constants.Manufacturer);
  if (!autoStartIntent) return { openedBatterySettings, openedAutoStartSettings };

  try {
    await IntentLauncher.startActivityAsync("android.intent.action.MAIN", autoStartIntent);
    openedAutoStartSettings = true;
  } catch {
    // OEMs can rename or remove the auto-start page. The battery page remains useful on all Android devices.
  }
  return { openedBatterySettings, openedAutoStartSettings };
}
