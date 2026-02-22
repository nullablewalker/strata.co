/**
 * Structured logger with New Relic Log API integration.
 *
 * Buffers log entries during a request and flushes them to the New Relic Log
 * API in a single batch via `waitUntil()`. This avoids blocking the response
 * and works within Cloudflare Workers' V8 Isolate constraints (no long-lived
 * background processes, but `waitUntil` promises are allowed).
 *
 * When no license key is provided (local development), logs are written to the
 * console instead.
 */

export type LogLevel = "INFO" | "WARN" | "ERROR";

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  attributes: Record<string, unknown>;
}

export interface LoggerOptions {
  /** e.g. "production" or "development" */
  environment: string;
}

const NR_LOG_API_ENDPOINT = "https://log-api.newrelic.com/log/v1";

export class Logger {
  private buffer: LogEntry[] = [];
  private environment: string;

  constructor(options: LoggerOptions) {
    this.environment = options.environment;
  }

  info(message: string, attributes: Record<string, unknown> = {}): void {
    this.append("INFO", message, attributes);
  }

  warn(message: string, attributes: Record<string, unknown> = {}): void {
    this.append("WARN", message, attributes);
  }

  error(message: string, attributes: Record<string, unknown> = {}): void {
    this.append("ERROR", message, attributes);
  }

  /**
   * Flush buffered logs. If a license key is provided, logs are sent to New
   * Relic via `waitUntil()`. Otherwise they are written to the console (dev).
   */
  flush(ctx: ExecutionContext, licenseKey?: string): void {
    if (this.buffer.length === 0) return;

    const entries = [...this.buffer];
    this.buffer = [];

    if (!licenseKey) {
      // Dev fallback — print to console
      for (const entry of entries) {
        const fn =
          entry.level === "ERROR"
            ? console.error
            : entry.level === "WARN"
              ? console.warn
              : console.log;
        fn(`[${entry.level}] ${entry.message}`, entry.attributes);
      }
      return;
    }

    const payload = [
      {
        common: {
          attributes: {
            logtype: "hono-api",
            service: "strata-api",
            environment: this.environment,
          },
        },
        logs: entries,
      },
    ];

    ctx.waitUntil(
      fetch(NR_LOG_API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Api-Key": licenseKey,
        },
        body: JSON.stringify(payload),
      }).catch((err) => {
        // Swallow network errors — observability should never break the app
        console.error("[logger] Failed to flush logs to New Relic:", err);
      }),
    );
  }

  // ---- internal ----

  private append(
    level: LogLevel,
    message: string,
    attributes: Record<string, unknown>,
  ): void {
    this.buffer.push({
      timestamp: Date.now(),
      level,
      message,
      attributes,
    });
  }
}
