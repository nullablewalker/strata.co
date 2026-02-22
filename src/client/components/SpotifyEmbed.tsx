/**
 * SpotifyEmbed — A React component that uses the Spotify iFrame API
 * to programmatically control playback (auto-play on track change).
 *
 * Instead of a plain <iframe src="...">, this uses IFrameAPI.createController()
 * which gives us an EmbedController with play()/pause()/loadUri() methods.
 *
 * When the user clicks a play button (user interaction already happened),
 * we call loadUri() which loads and auto-plays the new track.
 *
 * @see https://developer.spotify.com/documentation/embeds/references/iframe-api
 */
import { useEffect, useRef, useCallback } from "react";

// --- Spotify iFrame API type declarations ---

interface SpotifyIFrameAPI {
  createController(
    element: HTMLElement,
    options: SpotifyEmbedOptions,
    callback: (controller: SpotifyEmbedController) => void,
  ): void;
}

interface SpotifyEmbedOptions {
  uri?: string;
  width?: string | number;
  height?: string | number;
}

interface SpotifyEmbedController {
  loadUri(uri: string): void;
  play(): void;
  pause(): void;
  resume(): void;
  togglePlay(): void;
  restart(): void;
  seek(seconds: number): void;
  destroy(): void;
  addListener(
    event: string,
    callback: (data?: Record<string, unknown>) => void,
  ): void;
  removeListener(
    event: string,
    callback: (data?: Record<string, unknown>) => void,
  ): void;
}

declare global {
  interface Window {
    onSpotifyIframeApiReady?: (api: SpotifyIFrameAPI) => void;
    SpotifyIframeApi?: SpotifyIFrameAPI;
  }
}

// --- Module-level singleton management ---

let iframeApi: SpotifyIFrameAPI | null = null;
let scriptLoaded = false;
const apiReadyCallbacks: Array<(api: SpotifyIFrameAPI) => void> = [];

/**
 * Ensures the Spotify iFrame API script is loaded exactly once,
 * and returns the API instance via callback.
 */
function ensureSpotifyApi(callback: (api: SpotifyIFrameAPI) => void) {
  // Already available
  if (iframeApi) {
    callback(iframeApi);
    return;
  }

  // Queue the callback
  apiReadyCallbacks.push(callback);

  // Already loading — just wait for the callback
  if (scriptLoaded) return;
  scriptLoaded = true;

  // Hook into the global callback
  window.onSpotifyIframeApiReady = (api: SpotifyIFrameAPI) => {
    iframeApi = api;
    // Flush all waiting callbacks
    for (const cb of apiReadyCallbacks) {
      cb(api);
    }
    apiReadyCallbacks.length = 0;
  };

  // Inject the script tag
  const script = document.createElement("script");
  script.src = "https://open.spotify.com/embed/iframe-api/v1";
  script.async = true;
  document.body.appendChild(script);
}

// --- React Component ---

interface SpotifyEmbedProps {
  /** Spotify track ID (e.g. "4iV5W9uYEdYUVa79Axb7Rh") */
  trackId: string;
  /** Width of the embed (default: "100%") */
  width?: string | number;
  /** Height of the embed (default: 80) */
  height?: number;
  /** Additional CSS class for the container div */
  className?: string;
}

export default function SpotifyEmbed({
  trackId,
  width = "100%",
  height = 80,
  className,
}: SpotifyEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<SpotifyEmbedController | null>(null);
  const initializedTrackRef = useRef<string | null>(null);

  // Initialize controller once when the component mounts
  const initController = useCallback(
    (api: SpotifyIFrameAPI) => {
      const el = containerRef.current;
      if (!el || controllerRef.current) return;

      const uri = `spotify:track:${trackId}`;
      initializedTrackRef.current = trackId;

      api.createController(
        el,
        { uri, width, height },
        (controller: SpotifyEmbedController) => {
          controllerRef.current = controller;

          // When the embed is ready, call play() to auto-start
          controller.addListener("ready", () => {
            controller.play();
          });
        },
      );
    },
    // We only want this to run on first mount with the initial trackId
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Load the API and create the controller on mount
  useEffect(() => {
    ensureSpotifyApi(initController);

    return () => {
      // Cleanup on unmount
      if (controllerRef.current) {
        controllerRef.current.destroy();
        controllerRef.current = null;
      }
      initializedTrackRef.current = null;
    };
  }, [initController]);

  // When trackId changes, load the new URI and trigger playback
  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (initializedTrackRef.current === trackId) return;

    initializedTrackRef.current = trackId;
    controller.loadUri(`spotify:track:${trackId}`);
    // loadUri() should auto-play, but call play() as a safety net.
    // A small delay ensures the embed has begun loading the new URI.
    const timer = setTimeout(() => {
      controller.play();
    }, 300);
    return () => clearTimeout(timer);
  }, [trackId]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: typeof width === "number" ? `${width}px` : width }}
    />
  );
}
