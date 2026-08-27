import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("mã phát hành ChatPHT", () => {
  it("nhúng releaseId bất biến vào cấu hình APK hiện tại", () => {
    const config = readFileSync(resolve(root, "app.config.ts"), "utf8");
    expect(config).toContain('const releaseId = "CPHT-1.0.43-vc47-stability-recovery"');
    expect(config).toContain("releaseId,");
  });

  it("hiển thị mã phát hành trong mục thông tin ứng dụng", () => {
    const profile = readFileSync(resolve(root, "app/(tabs)/profile.tsx"), "utf8");
    expect(profile).toContain("getInstalledReleaseId");
    expect(profile).toContain("Mã phát hành:");
  });

  it("đặt tên artifact và tiêu đề GitHub theo tag cùng commit ngắn", () => {
    const workflow = readFileSync(resolve(root, ".github/workflows/build-ota-base-apk.yml"), "utf8");
    expect(workflow).toContain('release_id="CPHT-${tag#v}-${short_sha}"');
    expect(workflow).toContain('asset_name="ChatPHT-${release_id}.apk"');
    expect(workflow).toContain('asset_file="./${asset_name}"');
    expect(workflow).toContain('cp "$APK_OUTPUT" "$asset_file"');
    expect(workflow).toContain('checksum_name="${asset_name}.sha256"');
    expect(workflow).toContain("--title \"ChatPHT $RELEASE_ID\"");
  });
});
