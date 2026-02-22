import { describe, it, expect, vi } from "vitest";
import { createMockContext, mockNext } from "../../test/mocks/hono-context";
import { createMockSession, createAuthenticatedSession } from "../../test/mocks/session";
import { authGuard } from "./session";

describe("authGuard", () => {
  const guard = authGuard();

  it("returns 401 when no userId in session", async () => {
    const ctx = createMockContext({ session: createMockSession() });
    const next = vi.fn();

    const response = await guard(ctx as never, next);

    expect(response).toBeInstanceOf(Response);
    expect(response?.status).toBe(401);
  });

  it('response body has { error: "Unauthorized" }', async () => {
    const ctx = createMockContext({ session: createMockSession() });
    const next = vi.fn();

    const response = await guard(ctx as never, next);

    const body = await response?.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("calls next() when userId exists in session", async () => {
    const ctx = createMockContext({ session: createAuthenticatedSession() });
    const next = vi.fn();

    await guard(ctx as never, next);

    expect(next).toHaveBeenCalled();
  });

  it("preserves session data through chain", async () => {
    const session = createAuthenticatedSession("user-xyz");
    const ctx = createMockContext({ session });
    const next = vi.fn();

    await guard(ctx as never, next);

    // Session should still have the userId accessible
    expect(session.get("userId")).toBe("user-xyz");
    expect(session.get("accessToken")).toBe("mock_access_token_valid");
  });
});
