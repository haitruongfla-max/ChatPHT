import { importPKCS8, SignJWT } from "jose";

export type FcmServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Đọc service account chỉ ở server; không gửi khóa bí mật xuống ứng dụng. */
export function readFcmServiceAccount(encoded = process.env.FCM_SERVICE_ACCOUNT_JSON_BASE64): FcmServiceAccount {
  if (!encoded) throw new Error("FCM_SERVICE_ACCOUNT_JSON_BASE64 chưa được cấu hình.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  } catch {
    throw new Error("FCM_SERVICE_ACCOUNT_JSON_BASE64 không phải JSON Base64 hợp lệ.");
  }

  const account = parsed as Partial<FcmServiceAccount>;
  if (!account.client_email || !account.private_key || !account.project_id) {
    throw new Error("Firebase service account thiếu client_email, private_key hoặc project_id.");
  }

  return account as FcmServiceAccount;
}

/** Lấy access token HTTP v1 ngắn hạn để gửi FCM trực tiếp từ server. */
export async function getFcmAccessToken(encoded?: string) {
  const account = readFcmServiceAccount(encoded);
  const privateKey = await importPKCS8(account.private_key, "RS256");
  const assertion = await new SignJWT({ scope: FCM_SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.client_email)
    .setSubject(account.client_email)
    .setAudience(GOOGLE_TOKEN_URL)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as GoogleTokenResponse;
  if (!response.ok || !payload.access_token || !payload.expires_in) {
    throw new Error(payload.error_description || payload.error || "Không lấy được Firebase access token.");
  }

  return { accessToken: payload.access_token, expiresIn: payload.expires_in, projectId: account.project_id };
}
