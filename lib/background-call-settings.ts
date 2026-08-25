export type BackgroundCallSettingsResult = {
  openedBatterySettings: boolean;
  openedAutoStartSettings: boolean;
};

export function getAutoStartIntentForBrand() {
  return null;
}

export async function openBackgroundCallSettings(): Promise<BackgroundCallSettingsResult> {
  return { openedBatterySettings: false, openedAutoStartSettings: false };
}
