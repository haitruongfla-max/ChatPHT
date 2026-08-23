export function parseSemanticVersion(value: string) {
  const match = value.match(/v?(\d+)\.(\d+)\.(\d+)/i);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] as const : null;
}

/** Extracts an Android versionCode embedded in a release asset name, e.g. `...-vc18.apk`. */
export function getBuildCodeFromAssetName(assetName: string) {
  const match = assetName.match(/(?:^|[-_.])vc(\d+)(?=[-_.]|$)/i);
  return match ? Number(match[1]) : null;
}

export function isReleaseNewerThanInstalled({
  releaseVersion,
  releaseBuildCode,
  installedVersion,
  installedBuildCode,
}: {
  releaseVersion: string;
  releaseBuildCode?: number | null;
  installedVersion: string;
  installedBuildCode?: string | number | null;
}) {
  const installedCode = Number(installedBuildCode);
  if (Number.isInteger(releaseBuildCode) && releaseBuildCode! > 0 && Number.isInteger(installedCode) && installedCode > 0) {
    return releaseBuildCode! > installedCode;
  }

  const release = parseSemanticVersion(releaseVersion);
  const installed = parseSemanticVersion(installedVersion);
  if (!release || !installed) return false;
  for (let index = 0; index < release.length; index += 1) {
    if (release[index] !== installed[index]) return release[index] > installed[index];
  }
  return false;
}
