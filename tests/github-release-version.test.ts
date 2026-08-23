import { describe, expect, it } from "vitest";

import { getBuildCodeFromAssetName, isReleaseNewerThanInstalled } from "../lib/github-release-version";

describe("GitHub APK release version", () => {
  it("extracts the explicit Android versionCode from the trusted APK filename", () => {
    expect(getBuildCodeFromAssetName("ChatPHT-1.0.16-OTA-Base-Fix-vc18.apk")).toBe(18);
    expect(getBuildCodeFromAssetName("ChatPHT-1.0.16-OTA-Base.apk")).toBeNull();
  });

  it("offers a same-display-version APK only when its Android versionCode is higher", () => {
    expect(isReleaseNewerThanInstalled({ releaseVersion: "1.0.16", releaseBuildCode: 18, installedVersion: "1.0.16", installedBuildCode: "17" })).toBe(true);
    expect(isReleaseNewerThanInstalled({ releaseVersion: "1.0.16", releaseBuildCode: 17, installedVersion: "1.0.16", installedBuildCode: "17" })).toBe(false);
  });

  it("falls back to semantic version ordering only when build codes are not available", () => {
    expect(isReleaseNewerThanInstalled({ releaseVersion: "1.0.17", installedVersion: "1.0.16" })).toBe(true);
    expect(isReleaseNewerThanInstalled({ releaseVersion: "1.0.15", installedVersion: "1.0.16" })).toBe(false);
  });
});
