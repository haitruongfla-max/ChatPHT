import { createSign } from "node:crypto";

import { describe, expect, it } from "vitest";

const describeCredentialValidation =
  process.env.RUN_CREDENTIAL_SECRET_VALIDATION === "true" ? describe : describe.skip;

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function createGoogleServiceAccountAssertion(serviceAccount: {
  client_email: string;
  private_key: string;
}) {
  const now = Math.floor(Date.now() / 1000);
  const unsignedAssertion = [
    base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    base64Url(
      JSON.stringify({
        iss: serviceAccount.client_email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 300,
      }),
    ),
  ].join(".");
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedAssertion);
  signer.end();
  return `${unsignedAssertion}.${signer.sign(serviceAccount.private_key, "base64url")}`;
}

describeCredentialValidation("EAS credentials supplied securely", () => {
  it("authenticates the Expo token against the Expo account endpoint", async () => {
    const token = process.env.EXPO_TOKEN;
    expect(token, "EXPO_TOKEN is required for EAS credential management").toBeTruthy();

    const response = await fetch("https://api.expo.dev/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "query { me { id username } }" }),
    });
    const payload = (await response.json()) as {
      data?: { me?: { id?: string; username?: string } };
    };

    expect(response.ok).toBe(true);
    expect(payload.data?.me?.id).toBeTruthy();
    expect(payload.data?.me?.username).toBeTruthy();
  });

  it("exchanges the FCM V1 service account assertion for a Google access token", async () => {
    const rawServiceAccount = process.env.FCM_V1_SERVICE_ACCOUNT_JSON;
    expect(rawServiceAccount, "FCM_V1_SERVICE_ACCOUNT_JSON is required for FCM V1").toBeTruthy();

    const serviceAccount = JSON.parse(rawServiceAccount!) as {
      client_email?: string;
      private_key?: string;
    };
    expect(serviceAccount.client_email).toBeTruthy();
    expect(serviceAccount.private_key).toBeTruthy();

    const parameters = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: createGoogleServiceAccountAssertion({
        client_email: serviceAccount.client_email!,
        private_key: serviceAccount.private_key!,
      }),
    });
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: parameters,
    });
    const payload = (await response.json()) as { access_token?: string };

    expect(response.ok).toBe(true);
    expect(payload.access_token).toBeTruthy();
  });
});
