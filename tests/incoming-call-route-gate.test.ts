import { beforeEach, describe, expect, it } from "vitest";

import {
  claimIncomingCallRoute,
  releaseIncomingCallRoute,
  resetIncomingCallRouteGateForTest,
} from "../lib/incoming-call-route-gate";

describe("incoming call route gate", () => {
  beforeEach(() => resetIncomingCallRouteGateForTest());

  it("allows exactly one root listener to open an incoming call session", () => {
    expect(claimIncomingCallRoute("call-a")).toBe(true);
    expect(claimIncomingCallRoute("call-a")).toBe(false);
    expect(claimIncomingCallRoute("call-b")).toBe(false);
  });

  it("releases only the route that owns the session", () => {
    claimIncomingCallRoute("call-a");
    releaseIncomingCallRoute("call-b");
    expect(claimIncomingCallRoute("call-b")).toBe(false);
    releaseIncomingCallRoute("call-a");
    expect(claimIncomingCallRoute("call-b")).toBe(true);
  });
});
