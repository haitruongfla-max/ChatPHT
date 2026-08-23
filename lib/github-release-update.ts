// TypeScript resolves this file while Metro chooses github-release-update.native.ts or
// github-release-update.web.ts at runtime. The native implementation is re-exported so
// editor tooling keeps the same public surface on all platforms.
export * from "./github-release-update.native";
