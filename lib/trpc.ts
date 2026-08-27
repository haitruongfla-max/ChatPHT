import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/routers";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";

/**
 * tRPC React client for type-safe API calls.
 *
 * IMPORTANT (tRPC v11): The `transformer` must be inside `httpBatchLink`,
 * NOT at the root createClient level. This ensures client and server
 * use the same serialization format (superjson).
 */
export const trpc = createTRPCReact<AppRouter>();

let apiCooldownUntil = 0;

function getRetryAfterMs(response: Response) {
  const retryAfterSeconds = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(Math.round(retryAfterSeconds * 1_000), 60_000);
  }
  return 15_000;
}

/**
 * Creates the tRPC client with proper configuration.
 * Call this once in your app's root layout.
 */
export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${getApiBaseUrl()}/api/trpc`,
        // tRPC v11: transformer MUST be inside httpBatchLink, not at root
        transformer: superjson,
        async headers() {
          const token = await Auth.getSessionToken();
          // Trạng thái call và hàng signaling là dữ liệu tức thời; không cho proxy/thiết bị
          // tái sử dụng response `ringing` sau khi phía còn lại đã answer.
          return {
            Accept: "application/json",
            "Cache-Control": "no-store, no-cache, max-age=0",
            Pragma: "no-cache",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          };
        },
        // Custom fetch to include credentials for cookie-based auth
        async fetch(url, options) {
          const now = Date.now();
          if (now < apiCooldownUntil) {
            const remainingSeconds = Math.max(1, Math.ceil((apiCooldownUntil - now) / 1_000));
            throw new Error(`Máy chủ ChatPHT đang tạm giới hạn yêu cầu (HTTP 429). Ứng dụng sẽ thử lại sau ${remainingSeconds} giây.`);
          }
          const response = await fetch(url, {
            ...options,
            credentials: "include",
          });
          const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
          if (response.status === 429) {
            apiCooldownUntil = Date.now() + getRetryAfterMs(response);
            const preview = (await response.clone().text()).replace(/\s+/g, " ").trim().slice(0, 80);
            throw new Error(`Máy chủ ChatPHT đang tạm giới hạn yêu cầu (HTTP 429). ${preview ? "Vui lòng đợi ít giây rồi thử lại." : ""}`);
          }
          if (!contentType.includes("application/json")) {
            const preview = (await response.clone().text()).replace(/\s+/g, " ").trim().slice(0, 80);
            throw new Error(`Máy chủ ChatPHT trả về dữ liệu không hợp lệ (HTTP ${response.status}; ${contentType || "không có Content-Type"}). ${preview ? "Vui lòng thử lại khi mạng ổn định." : ""}`);
          }
          return response;
        },
      }),
    ],
  });
}
