import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Export from "./Export";

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../lib/api";

const mockedApiFetch = apiFetch as ReturnType<typeof vi.fn>;

function renderExport() {
  return render(
    <MemoryRouter>
      <Export />
    </MemoryRouter>,
  );
}

const currentYear = new Date().getFullYear();

const mockSummary = {
  data: {
    year: currentYear,
    stats: {
      totalPlays: 12000,
      totalMs: 43_200_000_000, // 12000 hours
      uniqueTracks: 3000,
      uniqueArtists: 500,
    },
    topArtists: [
      { artistName: "Top Artist 1", playCount: 800, msPlayed: 2880000000 },
      { artistName: "Top Artist 2", playCount: 600, msPlayed: 2160000000 },
      { artistName: "Top Artist 3", playCount: 400, msPlayed: 1440000000 },
    ],
    topTracks: [
      { trackName: "Top Track 1", artistName: "Top Artist 1", playCount: 200 },
      { trackName: "Top Track 2", artistName: "Top Artist 2", playCount: 150 },
    ],
    monthlyPlays: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      playCount: 800 + i * 100,
    })),
    peakHour: { hour: 22, playCount: 1500 },
    availableYears: [currentYear, currentYear - 1, currentYear - 2],
  },
};

const mockEmptySummary = {
  data: {
    year: currentYear,
    stats: { totalPlays: 0, totalMs: 0, uniqueTracks: 0, uniqueArtists: 0 },
    topArtists: [],
    topTracks: [],
    monthlyPlays: [],
    peakHour: null,
    availableYears: [currentYear - 1, currentYear - 2],
  },
};

describe("Export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading spinner initially", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderExport();
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("fetches annual summary on mount", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    renderExport();
    expect(mockedApiFetch).toHaveBeenCalledWith(
      `/vault/annual-summary?year=${currentYear}`,
    );
  });

  it("renders dossier card with stats", async () => {
    mockedApiFetch.mockResolvedValue(mockSummary);
    renderExport();
    await waitFor(() => {
      expect(screen.getByText("12,000")).toBeTruthy();
    });
    expect(screen.getByText("Plays")).toBeTruthy();
    expect(screen.getByText("Hours")).toBeTruthy();
    expect(screen.getByText("3,000")).toBeTruthy();
    expect(screen.getByText("Unique Tracks")).toBeTruthy();
    expect(screen.getByText("500")).toBeTruthy();
  });

  it("renders top artists", async () => {
    mockedApiFetch.mockResolvedValue(mockSummary);
    renderExport();
    await waitFor(() => {
      expect(screen.getByText("Top Artists")).toBeTruthy();
    });
    // Artist names may appear in both top artists and top tracks sections
    expect(screen.getAllByText("Top Artist 1").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Top Artist 2").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Top Artist 3")).toBeTruthy();
  });

  it("renders top tracks", async () => {
    mockedApiFetch.mockResolvedValue(mockSummary);
    renderExport();
    await waitFor(() => {
      expect(screen.getByText("Top Tracks")).toBeTruthy();
    });
    expect(screen.getByText("Top Track 1")).toBeTruthy();
    expect(screen.getByText("Top Track 2")).toBeTruthy();
  });

  it("shows year in header", async () => {
    mockedApiFetch.mockResolvedValue(mockSummary);
    renderExport();
    await waitFor(() => {
      // Year appears in both the header card and the year selector
      expect(screen.getAllByText(String(currentYear)).length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders print button that calls window.print", async () => {
    const user = userEvent.setup();
    const printMock = vi.fn();
    vi.stubGlobal("print", printMock);

    mockedApiFetch.mockResolvedValue(mockSummary);
    renderExport();

    await waitFor(() => {
      expect(screen.getByText("Print / Save as PDF")).toBeTruthy();
    });

    await user.click(screen.getByText("Print / Save as PDF"));
    expect(printMock).toHaveBeenCalled();
  });

  it("shows empty state when no data for year", async () => {
    mockedApiFetch.mockResolvedValue(mockEmptySummary);
    renderExport();
    await waitFor(() => {
      expect(
        screen.getByText(`${currentYear}年のリスニングデータがありません。`),
      ).toBeTruthy();
    });
  });

  it("shows year selector when multiple years available", async () => {
    mockedApiFetch.mockResolvedValue(mockSummary);
    const { container } = renderExport();
    await waitFor(() => {
      const select = container.querySelector("select") as HTMLSelectElement;
      expect(select).toBeTruthy();
    });
  });

  it("year selector changes fetch", async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue(mockSummary);
    const { container } = renderExport();

    await waitFor(() => {
      const select = container.querySelector("select") as HTMLSelectElement;
      expect(select).toBeTruthy();
    });

    const select = container.querySelector("select") as HTMLSelectElement;
    await user.selectOptions(select, String(currentYear - 1));

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        `/vault/annual-summary?year=${currentYear - 1}`,
      );
    });
  });

  it("shows peak hour", async () => {
    mockedApiFetch.mockResolvedValue(mockSummary);
    renderExport();
    await waitFor(() => {
      expect(screen.getByText("Peak Listening Hour")).toBeTruthy();
    });
    // formatHour(22) => "10 PM"
    expect(screen.getByText("10 PM")).toBeTruthy();
  });

  it("renders monthly activity chart", async () => {
    mockedApiFetch.mockResolvedValue(mockSummary);
    renderExport();
    await waitFor(() => {
      expect(screen.getByText("Monthly Activity")).toBeTruthy();
    });
    // Month labels should be present
    expect(screen.getByText("Jan")).toBeTruthy();
    expect(screen.getByText("Dec")).toBeTruthy();
  });
});
