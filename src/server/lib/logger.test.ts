import { describe, it, expect, vi, beforeEach } from "vitest";
import { Logger } from "./logger";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockExecutionCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

describe("Logger", () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger({ environment: "test" });
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Buffering
  // -----------------------------------------------------------------------

  describe("buffering", () => {
    it("info() adds an INFO entry to the buffer", () => {
      logger.info("hello", { key: "value" });

      const ctx = createMockExecutionCtx();
      // Flush without license key to capture via console
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      logger.flush(ctx);

      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith(
        "[INFO] hello",
        expect.objectContaining({ key: "value" }),
      );
    });

    it("warn() adds a WARN entry to the buffer", () => {
      logger.warn("caution");

      const ctx = createMockExecutionCtx();
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      logger.flush(ctx);

      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith("[WARN] caution", expect.any(Object));
    });

    it("error() adds an ERROR entry to the buffer", () => {
      logger.error("boom", { code: 500 });

      const ctx = createMockExecutionCtx();
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      logger.flush(ctx);

      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith(
        "[ERROR] boom",
        expect.objectContaining({ code: 500 }),
      );
    });

    it("buffers multiple entries in order", () => {
      logger.info("first");
      logger.warn("second");
      logger.error("third");

      const ctx = createMockExecutionCtx();
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      logger.flush(ctx);

      expect(logSpy).toHaveBeenCalledWith("[INFO] first", expect.any(Object));
      expect(warnSpy).toHaveBeenCalledWith("[WARN] second", expect.any(Object));
      expect(errorSpy).toHaveBeenCalledWith(
        "[ERROR] third",
        expect.any(Object),
      );
    });

    it("defaults attributes to empty object when omitted", () => {
      logger.info("no-attrs");

      const ctx = createMockExecutionCtx();
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      logger.flush(ctx);

      expect(spy).toHaveBeenCalledWith("[INFO] no-attrs", {});
    });
  });

  // -----------------------------------------------------------------------
  // flush() — console fallback (no license key)
  // -----------------------------------------------------------------------

  describe("flush() without license key", () => {
    it("writes entries to console", () => {
      logger.info("dev-log");

      const ctx = createMockExecutionCtx();
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      logger.flush(ctx);

      expect(spy).toHaveBeenCalledOnce();
      expect(ctx.waitUntil).not.toHaveBeenCalled();
    });

    it("does not call waitUntil", () => {
      logger.info("msg");

      const ctx = createMockExecutionCtx();
      vi.spyOn(console, "log").mockImplementation(() => {});
      logger.flush(ctx);

      expect(ctx.waitUntil).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // flush() — New Relic (with license key)
  // -----------------------------------------------------------------------

  describe("flush() with license key", () => {
    const LICENSE_KEY = "nr_test_license_key_1234";

    it("calls waitUntil with a fetch to NR Log API", () => {
      const mockFetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("ok", { status: 202 }));

      logger.info("request", { "http.status_code": 200 });

      const ctx = createMockExecutionCtx();
      logger.flush(ctx, LICENSE_KEY);

      expect(ctx.waitUntil).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledWith(
        "https://log-api.newrelic.com/log/v1",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Api-Key": LICENSE_KEY,
          },
        }),
      );
    });

    it("sends payload matching NR format", () => {
      const mockFetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("ok", { status: 202 }));

      logger.info("test-msg", { foo: "bar" });

      const ctx = createMockExecutionCtx();
      logger.flush(ctx, LICENSE_KEY);

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]!.body as string);

      // Top-level is an array with one element
      expect(body).toHaveLength(1);

      // common.attributes
      expect(body[0].common.attributes).toEqual({
        logtype: "hono-api",
        service: "strata-api",
        environment: "test",
      });

      // logs array
      expect(body[0].logs).toHaveLength(1);
      expect(body[0].logs[0]).toMatchObject({
        level: "INFO",
        message: "test-msg",
        attributes: { foo: "bar" },
      });
      expect(body[0].logs[0].timestamp).toEqual(expect.any(Number));
    });

    it("sends all buffered entries in a single batch", () => {
      const mockFetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("ok", { status: 202 }));

      logger.info("one");
      logger.warn("two");
      logger.error("three");

      const ctx = createMockExecutionCtx();
      logger.flush(ctx, LICENSE_KEY);

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1]!.body as string);

      expect(body[0].logs).toHaveLength(3);
      expect(body[0].logs[0].level).toBe("INFO");
      expect(body[0].logs[1].level).toBe("WARN");
      expect(body[0].logs[2].level).toBe("ERROR");
    });
  });

  // -----------------------------------------------------------------------
  // flush() — buffer clearing
  // -----------------------------------------------------------------------

  describe("flush() clears the buffer", () => {
    it("second flush is a no-op when no new entries", () => {
      logger.info("only-once");

      const ctx = createMockExecutionCtx();
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      logger.flush(ctx);

      expect(spy).toHaveBeenCalledOnce();
      spy.mockClear();

      // Second flush — buffer should be empty
      logger.flush(ctx);
      expect(spy).not.toHaveBeenCalled();
    });

    it("flush with empty buffer does nothing", () => {
      const ctx = createMockExecutionCtx();
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      logger.flush(ctx);

      expect(spy).not.toHaveBeenCalled();
      expect(ctx.waitUntil).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // flush() — error handling
  // -----------------------------------------------------------------------

  describe("flush() error handling", () => {
    it("network errors in flush do not throw", () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(
        new Error("Network failure"),
      );

      logger.info("log-before-error");

      const ctx = createMockExecutionCtx();

      // Should not throw
      expect(() => logger.flush(ctx, "license-key")).not.toThrow();
    });

    it("logs network errors to console.error via catch handler", async () => {
      const fetchError = new Error("Network failure");
      vi.spyOn(globalThis, "fetch").mockRejectedValue(fetchError);
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      logger.info("log-entry");

      const ctx = createMockExecutionCtx();
      logger.flush(ctx, "license-key");

      // waitUntil receives the promise — await it so the catch handler fires
      const waitUntilPromise = (ctx.waitUntil as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      await waitUntilPromise;

      expect(consoleSpy).toHaveBeenCalledWith(
        "[logger] Failed to flush logs to New Relic:",
        fetchError,
      );
    });
  });
});
