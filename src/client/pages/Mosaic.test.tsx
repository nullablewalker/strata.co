import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Mosaic from "./Mosaic";

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../lib/api";

const mockedApiFetch = apiFetch as ReturnType<typeof vi.fn>;

function renderMosaic() {
  return render(
    <MemoryRouter>
      <Mosaic />
    </MemoryRouter>,
  );
}

const mockMosaicData = {
  data: [
    {
      month: "2025-01",
      albums: [
        {
          month: "2025-01",
          albumName: "Album Alpha",
          artistName: "Artist One",
          playCount: 50,
          msPlayed: 12000000,
          trackSpotifyId: "sp_track_1",
        },
        {
          month: "2025-01",
          albumName: "Album Beta",
          artistName: "Artist Two",
          playCount: 30,
          msPlayed: 7200000,
          trackSpotifyId: "sp_track_2",
        },
      ],
    },
    {
      month: "2025-02",
      albums: [
        {
          month: "2025-02",
          albumName: "Album Gamma",
          artistName: "Artist Three",
          playCount: 40,
          msPlayed: 9600000,
          trackSpotifyId: "sp_track_3",
        },
      ],
    },
  ],
};

const mockMetadata = {
  data: {
    sp_track_1: { albumArt: "https://example.com/art1.jpg", albumName: "Album Alpha" },
    sp_track_2: { albumArt: "https://example.com/art2.jpg", albumName: "Album Beta" },
    sp_track_3: { albumArt: "https://example.com/art3.jpg", albumName: "Album Gamma" },
  },
};

describe("Mosaic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders page header", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    renderMosaic();
    expect(screen.getByText("Album Art Timeline")).toBeTruthy();
  });

  it("fetches mosaic data on mount", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    renderMosaic();
    expect(mockedApiFetch).toHaveBeenCalledWith("/vault/mosaic");
  });

  it("shows loading skeleton while fetching", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderMosaic();
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("shows empty state when no data", async () => {
    mockedApiFetch.mockResolvedValue({ data: [] });
    renderMosaic();
    await waitFor(() => {
      expect(screen.getByText("No listening history yet")).toBeTruthy();
    });
    expect(screen.getByText("Import your streaming history")).toBeTruthy();
  });

  it("renders month groups with formatted labels", async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path.includes("/vault/mosaic")) return Promise.resolve(mockMosaicData);
      if (path.includes("/vault/metadata")) return Promise.resolve(mockMetadata);
      return Promise.reject(new Error("unexpected"));
    });

    renderMosaic();
    await waitFor(() => {
      expect(screen.getByText("Jan 2025")).toBeTruthy();
    });
    expect(screen.getByText("Feb 2025")).toBeTruthy();
  });

  it("fetches metadata in batches after mosaic data loads", async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path.includes("/vault/mosaic")) return Promise.resolve(mockMosaicData);
      if (path.includes("/vault/metadata")) return Promise.resolve(mockMetadata);
      return Promise.reject(new Error("unexpected"));
    });

    renderMosaic();
    await waitFor(() => {
      const metaCalls = mockedApiFetch.mock.calls.filter((c: unknown[]) =>
        (c[0] as string).includes("/vault/metadata"),
      );
      expect(metaCalls.length).toBeGreaterThan(0);
    });
  });

  it("shows error state on fetch failure", async () => {
    mockedApiFetch.mockRejectedValue(new Error("Failed to load data"));
    renderMosaic();
    await waitFor(() => {
      expect(screen.getByText("Failed to load data")).toBeTruthy();
    });
  });
});
