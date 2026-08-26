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
          const response = await fetch(url, {
            ...options,
            credentials: "include",
          });
          const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
          const preview = (await response.clone().text()).replace(/\s+/g, " ").trim().slice(0, 80);
          const looksLikeHtml = /^<(?:!doctype|html|head|body|div|title)\b/i.test(preview);
          if (!contentType.includes("application/json") || looksLikeHtml) {
            throw new Error(`Máy chủ ChatPHT trả về dữ liệu không hợp lệ (HTTP ${response.status}; ${contentType || "không có Content-Type"}). ${preview ? "Vui lòng thử lại khi mạng ổn định." : ""}`);
          }
          return response;
        },
      }),
    ],
  });
}
