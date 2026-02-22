import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiFetch } from "./api";

describe("apiFetch", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(body: unknown, status = 200, statusText = "OK") {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        statusText,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  it("prepends /api to the path", async () => {
    mockFetch({ data: "ok" });
    await apiFetch("/auth/me");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/auth/me",
      expect.any(Object),
    );
  });

  it("sets Content-Type: application/json by default", async () => {
    mockFetch({ data: "ok" });
    await apiFetch("/test");
    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0][1];
    expect(callArgs.headers["Content-Type"]).toBe("application/json");
  });

  it("returns parsed JSON on success", async () => {
    mockFetch({ data: { id: 1, name: "test" } });
    const result = await apiFetch<{ data: { id: number; name: string } }>(
      "/test",
    );
    expect(result).toEqual({ data: { id: 1, name: "test" } });
  });

  it("throws on non-2xx status codes", async () => {
    mockFetch({ error: "not found" }, 404, "Not Found");
    await expect(apiFetch("/missing")).rejects.toThrow("API error");
  });

  it("includes status and statusText in the error message", async () => {
    mockFetch({ error: "forbidden" }, 403, "Forbidden");
    await expect(apiFetch("/secret")).rejects.toThrow(
      "API error: 403 Forbidden",
    );
  });

  it("allows custom headers to override defaults", async () => {
    mockFetch({ ok: true });
    await apiFetch("/upload", {
      headers: { "Content-Type": "multipart/form-data" },
    });
    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0][1];
    expect(callArgs.headers["Content-Type"]).toBe("multipart/form-data");
  });

  it("merges additional custom headers with defaults", async () => {
    mockFetch({ ok: true });
    await apiFetch("/test", {
      headers: { Authorization: "Bearer tok123" },
    });
    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0][1];
    expect(callArgs.headers["Content-Type"]).toBe("application/json");
    expect(callArgs.headers["Authorization"]).toBe("Bearer tok123");
  });

  it("passes method and body through to fetch", async () => {
    mockFetch({ created: true });
    const body = JSON.stringify({ name: "test" });
    await apiFetch("/items", { method: "POST", body });
    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0][1];
    expect(callArgs.method).toBe("POST");
    expect(callArgs.body).toBe(body);
  });

  it("works with generic type parameter", async () => {
    mockFetch({ data: { id: "u1", spotifyId: "sp1" } });
    const result = await apiFetch<{ data: { id: string; spotifyId: string } }>(
      "/auth/me",
    );
    expect(result.data.id).toBe("u1");
    expect(result.data.spotifyId).toBe("sp1");
  });
});
