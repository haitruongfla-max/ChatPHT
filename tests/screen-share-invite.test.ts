import { describe, expect, it } from "vitest";

import {
  createScreenShareInviteBody,
  parseScreenShareInviteBody,
} from "../lib/screen-share-invite";

describe("screen share invite", () => {
  const sessionId = "3b61e23b-6cad-4ed0-9972-36ff3f260778";

  it("round-trips a valid session identifier", () => {
    expect(parseScreenShareInviteBody(createScreenShareInviteBody(sessionId))).toBe(sessionId);
  });

  it("does not treat plain text or malformed identifiers as invitations", () => {
    expect(parseScreenShareInviteBody("Hãy xem màn hình của tôi")).toBeNull();
    expect(parseScreenShareInviteBody("chatpht:screen-share:not-a-session")).toBeNull();
    expect(parseScreenShareInviteBody("chatpht:screen-share:3b61e23b-6cad-7ed0-9972-36ff3f260778")).toBeNull();
  });
});
