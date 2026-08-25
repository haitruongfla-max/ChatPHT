/** Web/server fallback. Android resolves android-audio-route.native.ts instead. */
export async function setAndroidCallSpeakerRoute(_enabled: boolean) {
  // No native audio route outside Android.
}

export async function resetAndroidCallSpeakerRoute() {
  // No native audio route outside Android.
}
