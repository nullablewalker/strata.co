/**
 * New Relic Browser Agent initialization.
 *
 * Config values come from the New Relic UI:
 *   Browser > Application settings > Copy/paste JavaScript
 *
 * Required env vars (prefixed with VITE_ so Vite exposes them):
 *   VITE_NEW_RELIC_ACCOUNT_ID
 *   VITE_NEW_RELIC_APPLICATION_ID
 *   VITE_NEW_RELIC_LICENSE_KEY      — the browser/ingest key, NOT the main license key
 *   VITE_NEW_RELIC_AGENT_ID
 *   VITE_NEW_RELIC_TRUST_KEY
 */
import { BrowserAgent } from "@newrelic/browser-agent/loaders/browser-agent";

let agent: BrowserAgent | null = null;

/**
 * Initialize the New Relic Browser Agent.
 * Silently skipped when env vars are missing (local development).
 */
export function initNewRelic(): void {
  const accountID = import.meta.env.VITE_NEW_RELIC_ACCOUNT_ID;
  const applicationID = import.meta.env.VITE_NEW_RELIC_APPLICATION_ID;
  const licenseKey = import.meta.env.VITE_NEW_RELIC_LICENSE_KEY;
  const agentID = import.meta.env.VITE_NEW_RELIC_AGENT_ID;
  const trustKey = import.meta.env.VITE_NEW_RELIC_TRUST_KEY;

  if (!accountID || !applicationID || !licenseKey || !agentID || !trustKey) {
    console.debug(
      "[NewRelic] Skipping initialization — missing env vars (expected in dev)",
    );
    return;
  }

  agent = new BrowserAgent({
    init: {
      distributed_tracing: { enabled: true },
      privacy: { cookies_enabled: true },
      ajax: { deny_list: [] },
    },
    info: {
      beacon: "bam.nr-data.net",
      errorBeacon: "bam.nr-data.net",
      licenseKey,
      applicationID,
      sa: 1,
    },
    loader_config: {
      accountID,
      trustKey,
      agentID,
      licenseKey,
      applicationID,
    },
  });
}

/**
 * Report an error to New Relic. No-op when the agent is not initialized.
 */
export function noticeError(
  error: Error,
  customAttributes?: Record<string, string>,
): void {
  if (!agent) return;
  agent.noticeError(error, customAttributes);
}
