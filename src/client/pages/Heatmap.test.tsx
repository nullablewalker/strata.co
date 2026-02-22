import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Heatmap from "./Heatmap";

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../lib/api";

const mockedApiFetch = apiFetch as ReturnType<typeof vi.fn>;

// Mock ResizeObserver for D3 charts
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

function renderHeatmap() {
  return render(
    <MemoryRouter>
      <Heatmap />
    </MemoryRouter>,
  );
}

const currentYear = new Date().getUTCFullYear();

const mockHeatmapData = {
  data: [
    { date: `${currentYear}-01-15`, count: 25, msPlayed: 3600000 },
    { date: `${currentYear}-02-20`, count: 40, msPlayed: 7200000 },
  ],
};

const mockSummary = {
  data: {
    totalPlays: 5000,
    activeDays: 250,
    longestStreak: 45,
    mostActiveDay: { date: `${currentYear}-02-20`, count: 40 },
    averageDailyPlays: 20,
    completionRate: 82,
    activeSelectionRate: 65,
  },
};

const mockArtists = {
  data: [
    { artistName: "Artist Alpha", totalPlays: 500 },
    { artistName: "Artist Beta", totalPlays: 300 },
  ],
};

const mockSilences = {
  data: {
    silences: [],
    totalSilentDays: 0,
  },
};

describe("Heatmap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders page header", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    renderHeatmap();
    expect(screen.getByText("Fandom Heatmap")).toBeTruthy();
    expect(
      screen.getByText("Your listening intensity, layered across time"),
    ).toBeTruthy();
  });

  it("fetches heatmap data, summary, and artists on mount", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    renderHeatmap();

    const calls = mockedApiFetch.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls.some((c) => c.includes("/heatmap/data"))).toBe(true);
    expect(calls.some((c) => c.includes("/heatmap/summary"))).toBe(true);
    expect(calls.some((c) => c.includes("/heatmap/artists"))).toBe(true);
  });

  it("shows summary stats after data loads", async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path.includes("/heatmap/data")) return Promise.resolve(mockHeatmapData);
      if (path.includes("/heatmap/summary")) return Promise.resolve(mockSummary);
      if (path.includes("/heatmap/artists")) return Promise.resolve(mockArtists);
      if (path.includes("/heatmap/silences")) return Promise.resolve(mockSilences);
      return Promise.reject(new Error("unexpected"));
    });

    renderHeatmap();
    await waitFor(() => {
      expect(screen.getByText("5,000")).toBeTruthy();
    });
    expect(screen.getByText("Total Plays")).toBeTruthy();
    expect(screen.getByText("Active Days")).toBeTruthy();
    expect(screen.getByText("250")).toBeTruthy();
    expect(screen.getByText("Longest Streak")).toBeTruthy();
    expect(screen.getByText("45d")).toBeTruthy();
  });

  it("renders year selector buttons", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    renderHeatmap();
    // Current year and 4 previous years should be shown
    expect(screen.getByText(String(currentYear))).toBeTruthy();
    expect(screen.getByText(String(currentYear - 1))).toBeTruthy();
  });

  it("year selector changes data fetch", async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockImplementation((path: string) => {
      if (path.includes("/heatmap/data")) return Promise.resolve(mockHeatmapData);
      if (path.includes("/heatmap/summary")) return Promise.resolve(mockSummary);
      if (path.includes("/heatmap/artists")) return Promise.resolve(mockArtists);
      if (path.includes("/heatmap/silences")) return Promise.resolve(mockSilences);
      return Promise.reject(new Error("unexpected"));
    });

    renderHeatmap();
    const prevYearBtn = screen.getByText(String(currentYear - 1));
    await user.click(prevYearBtn);

    await waitFor(() => {
      const calls = mockedApiFetch.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(
        calls.some((c) => c.includes(`year=${currentYear - 1}`)),
      ).toBe(true);
    });
  });

  it("renders artist filter dropdown", async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path.includes("/heatmap/data")) return Promise.resolve(mockHeatmapData);
      if (path.includes("/heatmap/summary")) return Promise.resolve(mockSummary);
      if (path.includes("/heatmap/artists")) return Promise.resolve(mockArtists);
      if (path.includes("/heatmap/silences")) return Promise.resolve(mockSilences);
      return Promise.reject(new Error("unexpected"));
    });

    const { container } = renderHeatmap();
    await waitFor(() => {
      const selects = container.querySelectorAll("select");
      // Should have at least one select: the artist filter
      expect(selects.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows error state on fetch failure", async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path.includes("/heatmap/artists")) return Promise.resolve(mockArtists);
      return Promise.reject(new Error("Failed"));
    });

    renderHeatmap();
    await waitFor(() => {
      expect(screen.getByText("Failed to load heatmap data")).toBeTruthy();
    });
    expect(screen.getByText("Retry")).toBeTruthy();
  });
});
