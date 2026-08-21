import { describe, expect, it } from "vitest";
import { assertValidUsername, hashPassword, normalizeUsername, verifyPassword } from "../server/auth";

describe("local account security", () => {
  it("normalizes and validates a username", () => {
    expect(normalizeUsername("  Swift_User  ")).toBe("swift_user");
    expect(() => assertValidUsername("swift_user")).not.toThrow();
    expect(() => assertValidUsername("swift.user")).toThrow();
  });

  it("hashes passwords with a unique salt and verifies them safely", async () => {
    const firstHash = await hashPassword("a-safe-password");
    const secondHash = await hashPassword("a-safe-password");
    expect(firstHash).not.toBe(secondHash);
    await expect(verifyPassword("a-safe-password", firstHash)).resolves.toBe(true);
    await expect(verifyPassword("incorrect-password", firstHash)).resolves.toBe(false);
  });
});
