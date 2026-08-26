import { describe, expect, it } from "vitest";

import { formatByteSize, getBuildCodeFromAssetName, getDownloadProgressPercent, isReleaseNewerThanInstalled, isTrustedChatPhtReleaseApk } from "../lib/github-release-version";

describe("GitHub APK release version", () => {
  it("extracts the explicit Android versionCode from the trusted APK filename", () => {
    expect(getBuildCodeFromAssetName("ChatPHT-1.0.16-OTA-Base-Fix-vc18.apk")).toBe(18);
    expect(getBuildCodeFromAssetName("ChatPHT-1.0.16-OTA-Base.apk")).toBeNull();
  });

  it("chỉ tin cậy APK có định danh release, phiên bản và versionCode khớp tag", () => {
    expect(isTrustedChatPhtReleaseApk("ChatPHT-CPHT-1.0.33-github-auto-update-vc37-a1b2c3d4.apk", "v1.0.33-github-auto-update-vc37")).toBe(true);
    expect(isTrustedChatPhtReleaseApk("app-release.apk", "v1.0.33-github-auto-update-vc37")).toBe(false);
    expect(isTrustedChatPhtReleaseApk("ChatPHT-CPHT-1.0.32-legacy-vc36-a1b2c3d4.apk", "v1.0.33-github-auto-update-vc37")).toBe(false);
  });

  it("offers a same-display-version APK only when its Android versionCode is higher", () => {
    expect(isReleaseNewerThanInstalled({ releaseVersion: "1.0.16", releaseBuildCode: 18, installedVersion: "1.0.16", installedBuildCode: "17" })).toBe(true);
    expect(isReleaseNewerThanInstalled({ releaseVersion: "1.0.16", releaseBuildCode: 17, installedVersion: "1.0.16", installedBuildCode: "17" })).toBe(false);
  });

  it("falls back to semantic version ordering only when build codes are not available", () => {
    expect(isReleaseNewerThanInstalled({ releaseVersion: "1.0.17", installedVersion: "1.0.16" })).toBe(true);
    expect(isReleaseNewerThanInstalled({ releaseVersion: "1.0.15", installedVersion: "1.0.16" })).toBe(false);
  });

  it("formats a visible APK download progress without inventing an unknown total", () => {
    expect(getDownloadProgressPercent(25, 100)).toBe(25);
    expect(getDownloadProgressPercent(150, 100)).toBe(100);
    expect(getDownloadProgressPercent(25, null)).toBeNull();
    expect(formatByteSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(formatByteSize(null)).toBe("không rõ dung lượng");
  });
});
