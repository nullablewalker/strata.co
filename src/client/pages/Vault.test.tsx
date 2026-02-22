import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Vault from "./Vault";

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../lib/api";

const mockedApiFetch = apiFetch as ReturnType<typeof vi.fn>;

function renderVault() {
  return render(
    <MemoryRouter>
      <Vault />
    </MemoryRouter>,
  );
}

const mockStats = {
  data: {
    totalTracks: 2500,
    totalArtists: 200,
    totalPlays: 50000,
    totalMsPlayed: 360_000_000_0,
    dateRange: { from: "2020-01-01", to: "2025-12-31" },
    topTrack: { trackName: "Top Song", artistName: "Top Artist", playCount: 100 },
    topArtist: { artistName: "Top Artist", playCount: 500 },
    completionRate: 85,
    skipRate: 15,
  },
};

const mockArtists = {
  data: [
    { artistName: "Artist A" },
    { artistName: "Artist B" },
  ],
  total: 2,
};

const mockAlbums = { data: ["Album X", "Album Y"] };

const mockTracks = {
  data: [
    {
      trackSpotifyId: "sp1",
      trackName: "Song One",
      artistName: "Artist A",
      albumName: "Album X",
      playCount: 50,
      totalMsPlayed: 12000000,
      firstPlayedAt: "2023-01-01T00:00:00Z",
      lastPlayedAt: "2025-12-01T00:00:00Z",
    },
    {
      trackSpotifyId: "sp2",
      trackName: "Song Two",
      artistName: "Artist B",
      albumName: "Album Y",
      playCount: 30,
      totalMsPlayed: 7200000,
      firstPlayedAt: "2023-06-15T00:00:00Z",
      lastPlayedAt: "2025-11-15T00:00:00Z",
    },
  ],
  total: 2,
};

const mockMetadata = {
  data: {
    sp1: { albumArt: "https://example.com/art1.jpg", albumName: "Album X" },
    sp2: { albumArt: "https://example.com/art2.jpg", albumName: "Album Y" },
  },
};

describe("Vault", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders page header", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    renderVault();
    expect(screen.getByText("The Vault")).toBeTruthy();
    expect(
      screen.getByText("Your complete listening archive"),
    ).toBeTruthy();
  });

  it("shows loading skeleton initially", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderVault();
    expect(container.querySelector(".shimmer")).toBeTruthy();
  });

  it("fetches stats, artists, albums, and tracks on mount", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    renderVault();

    const calls = mockedApiFetch.mock.calls.map((c: unknown[]) => c[0]);
    expect(calls.some((c: string) => c.includes("/vault/stats"))).toBe(true);
    expect(calls.some((c: string) => c.includes("/vault/artists"))).toBe(true);
    expect(calls.some((c: string) => c.includes("/vault/albums"))).toBe(true);
    expect(calls.some((c: string) => c.includes("/vault/tracks"))).toBe(true);
  });

  it("renders stat cards after data loads", async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path.includes("/vault/stats")) return Promise.resolve(mockStats);
      if (path.includes("/vault/artists")) return Promise.resolve(mockArtists);
      if (path.includes("/vault/albums")) return Promise.resolve(mockAlbums);
      if (path.includes("/vault/tracks")) return Promise.resolve(mockTracks);
      if (path.includes("/vault/metadata")) return Promise.resolve(mockMetadata);
      return Promise.reject(new Error("unexpected"));
    });

    renderVault();
    await waitFor(() => {
      expect(screen.getByText("Unique Tracks")).toBeTruthy();
    });
    expect(screen.getByText("Artists")).toBeTruthy();
    expect(screen.getByText("Listening Time")).toBeTruthy();
  });

  it("renders track list after data loads", async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path.includes("/vault/stats")) return Promise.resolve(mockStats);
      if (path.includes("/vault/artists")) return Promise.resolve(mockArtists);
      if (path.includes("/vault/albums")) return Promise.resolve(mockAlbums);
      if (path.includes("/vault/tracks")) return Promise.resolve(mockTracks);
      if (path.includes("/vault/metadata")) return Promise.resolve(mockMetadata);
      return Promise.reject(new Error("unexpected"));
    });

    renderVault();
    await waitFor(() => {
      expect(screen.getByText("Song One")).toBeTruthy();
    });
    expect(screen.getByText("Song Two")).toBeTruthy();
    // Artist names appear in both ColumnBrowser and track list
    expect(screen.getAllByText("Artist A").length).toBeGreaterThanOrEqual(1);
  });

  it("has search input", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    renderVault();
    expect(screen.getByPlaceholderText("Search tracks...")).toBeTruthy();
  });

  it("has sort dropdown with options", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderVault();
    const select = container.querySelector("select") as HTMLSelectElement;
    expect(select).toBeTruthy();

    const options = Array.from(select.options).map((o) => o.text);
    expect(options).toContain("Most Played");
    expect(options).toContain("Most Time");
    expect(options).toContain("Recently Played");
    expect(options).toContain("Name A-Z");
  });

  it("search input triggers debounced fetch", async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockImplementation((path: string) => {
      if (path.includes("/vault/stats")) return Promise.resolve(mockStats);
      if (path.includes("/vault/artists")) return Promise.resolve(mockArtists);
      if (path.includes("/vault/albums")) return Promise.resolve(mockAlbums);
      if (path.includes("/vault/tracks")) return Promise.resolve(mockTracks);
      if (path.includes("/vault/metadata")) return Promise.resolve(mockMetadata);
      return Promise.reject(new Error("unexpected"));
    });

    renderVault();
    const searchInput = screen.getByPlaceholderText("Search tracks...");
    await user.type(searchInput, "test");

    // After debounce (300ms), a new fetch with search param should be triggered
    await waitFor(
      () => {
        const trackCalls = mockedApiFetch.mock.calls.filter((c: unknown[]) =>
          (c[0] as string).includes("/vault/tracks"),
        );
        const hasSearchParam = trackCalls.some((c: unknown[]) =>
          (c[0] as string).includes("search=test"),
        );
        expect(hasSearchParam).toBe(true);
      },
      { timeout: 1000 },
    );
  });

  it("shows empty state when no tracks", async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path.includes("/vault/stats")) return Promise.resolve(mockStats);
      if (path.includes("/vault/artists")) return Promise.resolve(mockArtists);
      if (path.includes("/vault/albums")) return Promise.resolve(mockAlbums);
      if (path.includes("/vault/tracks"))
        return Promise.resolve({ data: [], total: 0 });
      if (path.includes("/vault/metadata"))
        return Promise.resolve({ data: {} });
      return Promise.reject(new Error("unexpected"));
    });

    renderVault();
    await waitFor(() => {
      expect(screen.getByText("No listening history yet")).toBeTruthy();
    });
  });

  it("shows error message on fetch failure", async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path.includes("/vault/stats"))
        return Promise.reject(new Error("Server error"));
      if (path.includes("/vault/artists")) return Promise.resolve(mockArtists);
      if (path.includes("/vault/albums")) return Promise.resolve(mockAlbums);
      if (path.includes("/vault/tracks"))
        return Promise.reject(new Error("Server error"));
      if (path.includes("/vault/metadata"))
        return Promise.resolve({ data: {} });
      return Promise.reject(new Error("unexpected"));
    });

    renderVault();
    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeTruthy();
    });
  });

  it("fetches metadata for loaded tracks", async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path.includes("/vault/stats")) return Promise.resolve(mockStats);
      if (path.includes("/vault/artists")) return Promise.resolve(mockArtists);
      if (path.includes("/vault/albums")) return Promise.resolve(mockAlbums);
      if (path.includes("/vault/tracks")) return Promise.resolve(mockTracks);
      if (path.includes("/vault/metadata")) return Promise.resolve(mockMetadata);
      return Promise.reject(new Error("unexpected"));
    });

    renderVault();
    await waitFor(() => {
      const metadataCalls = mockedApiFetch.mock.calls.filter((c: unknown[]) =>
        (c[0] as string).includes("/vault/metadata"),
      );
      expect(metadataCalls.length).toBeGreaterThan(0);
    });
  });
});
