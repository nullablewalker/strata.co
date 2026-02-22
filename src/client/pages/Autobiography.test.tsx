import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Autobiography from "./Autobiography";

// Mock the api module
vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../lib/api";

const mockedApiFetch = apiFetch as ReturnType<typeof vi.fn>;

// Mock requestAnimationFrame for useCountUp hook
beforeEach(() => {
  vi.stubGlobal(
    "requestAnimationFrame",
    (cb: FrameRequestCallback) => {
      cb(performance.now() + 2000); // Jump past animation duration
      return 1;
    },
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

function renderAutobiography() {
  return render(
    <MemoryRouter>
      <Autobiography />
    </MemoryRouter>,
  );
}

const mockData = {
  data: {
    overall: {
      totalPlays: 15000,
      totalMs: 360_000_000, // 100 hours
      uniqueTracks: 2500,
      uniqueArtists: 400,
      firstPlay: "2020-03-15T00:00:00Z",
      lastPlay: "2025-12-15T00:00:00Z",
    },
    topArtists: [
      { artistName: "Radiohead", playCount: 500, msPlayed: 36_000_000 },
      { artistName: "Björk", playCount: 300, msPlayed: 21_600_000 },
      { artistName: "Aphex Twin", playCount: 200, msPlayed: 14_400_000 },
    ],
    topTracks: [
      {
        trackName: "Everything In Its Right Place",
        artistName: "Radiohead",
        playCount: 150,
        msPlayed: 3_600_000,
      },
    ],
    peakHour: { hour: 23, playCount: 1200 },
    peakYear: { year: 2023, playCount: 5000, msPlayed: 180_000_000 },
    nightStats: { playCount: 4500 },
    nightArtist: { artistName: "Boards of Canada", playCount: 300 },
  },
};

describe("Autobiography", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading skeleton initially", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {})); // Never resolves
    const { container } = renderAutobiography();
    expect(container.querySelector(".shimmer")).toBeTruthy();
  });

  it("shows error message on fetch failure", async () => {
    mockedApiFetch.mockRejectedValue(new Error("Network error"));
    renderAutobiography();
    await waitFor(() => {
      expect(
        screen.getByText("Failed to load autobiography data."),
      ).toBeTruthy();
    });
  });

  it("renders page header", async () => {
    mockedApiFetch.mockResolvedValue(mockData);
    renderAutobiography();
    await waitFor(() => {
      expect(screen.getByText("Listening Autobiography")).toBeTruthy();
    });
    expect(screen.getByText("あなたの音楽的自伝")).toBeTruthy();
  });

  // --- Helper function tests via rendered output ---

  it("formatDate: renders first/last play dates in YYYY/MM/DD", async () => {
    mockedApiFetch.mockResolvedValue(mockData);
    const { container } = renderAutobiography();
    await waitFor(() => {
      // Dates are inside <Num> (<span>) components within text
      // formatDate uses local timezone, so match the local representation
      const firstDate = new Date("2020-03-15T00:00:00Z");
      const expectedFirst = `${firstDate.getFullYear()}/${String(firstDate.getMonth() + 1).padStart(2, "0")}/${String(firstDate.getDate()).padStart(2, "0")}`;
      expect(container.textContent).toContain(expectedFirst);
    });
    const lastDate = new Date("2025-12-15T00:00:00Z");
    const expectedLast = `${lastDate.getFullYear()}/${String(lastDate.getMonth() + 1).padStart(2, "0")}/${String(lastDate.getDate()).padStart(2, "0")}`;
    expect(container.textContent).toContain(expectedLast);
  });

  it("msToDays: renders total days with 1 decimal", async () => {
    mockedApiFetch.mockResolvedValue(mockData);
    renderAutobiography();
    // 360_000_000ms / 86_400_000 = 4.166... → "4.2"
    await waitFor(() => {
      expect(screen.getByText("4.2")).toBeTruthy();
    });
  });

  it("getMetaphor: renders flight metaphor for 100 hours", async () => {
    mockedApiFetch.mockResolvedValue(mockData);
    renderAutobiography();
    // 100 hours / (14*2) = 3 round trips
    await waitFor(() => {
      expect(
        screen.getByText("東京からニューヨークへの往復フライト3回分"),
      ).toBeTruthy();
    });
  });

  it("getMetaphor: renders movie metaphor for small hours", async () => {
    const smallData = {
      data: {
        ...mockData.data,
        overall: {
          ...mockData.data.overall,
          totalMs: 18_000_000, // 5 hours → movies = 2
        },
      },
    };
    mockedApiFetch.mockResolvedValue(smallData);
    renderAutobiography();
    await waitFor(() => {
      expect(screen.getByText("映画2本分")).toBeTruthy();
    });
  });

  it("getMetaphor: renders fallback for very small hours", async () => {
    const tinyData = {
      data: {
        ...mockData.data,
        overall: {
          ...mockData.data.overall,
          totalMs: 3_000_000, // <1 hour → no movies, no flights
        },
      },
    };
    mockedApiFetch.mockResolvedValue(tinyData);
    renderAutobiography();
    await waitFor(() => {
      expect(screen.getByText("数え切れない瞬間の集積")).toBeTruthy();
    });
  });

  it("getListenerType: renders Night Owl for hour 23", async () => {
    mockedApiFetch.mockResolvedValue(mockData);
    renderAutobiography();
    await waitFor(() => {
      expect(screen.getByText("Night Owl")).toBeTruthy();
    });
  });

  it("getListenerType: renders Early Bird for morning hours", async () => {
    const morningData = {
      data: {
        ...mockData.data,
        peakHour: { hour: 7, playCount: 1000 },
      },
    };
    mockedApiFetch.mockResolvedValue(morningData);
    renderAutobiography();
    await waitFor(() => {
      expect(screen.getByText("Early Bird")).toBeTruthy();
    });
  });

  it("getListenerType: renders Daytime Listener for midday", async () => {
    const dayData = {
      data: {
        ...mockData.data,
        peakHour: { hour: 14, playCount: 1000 },
      },
    };
    mockedApiFetch.mockResolvedValue(dayData);
    renderAutobiography();
    await waitFor(() => {
      expect(screen.getByText("Daytime Listener")).toBeTruthy();
    });
  });

  it("getListenerType: renders Evening Listener for evening hours", async () => {
    const eveningData = {
      data: {
        ...mockData.data,
        peakHour: { hour: 20, playCount: 1000 },
      },
    };
    mockedApiFetch.mockResolvedValue(eveningData);
    renderAutobiography();
    await waitFor(() => {
      expect(screen.getByText("Evening Listener")).toBeTruthy();
    });
  });

  it("formatHour: renders peak hour as H:00", async () => {
    mockedApiFetch.mockResolvedValue(mockData);
    renderAutobiography();
    await waitFor(() => {
      expect(screen.getByText("23:00")).toBeTruthy();
    });
  });

  it("formatHour: renders 0:00 for midnight", async () => {
    const midnightData = {
      data: {
        ...mockData.data,
        peakHour: { hour: 0, playCount: 1000 },
      },
    };
    mockedApiFetch.mockResolvedValue(midnightData);
    renderAutobiography();
    await waitFor(() => {
      expect(screen.getByText("0:00")).toBeTruthy();
    });
  });

  it("renders top artist name and stats", async () => {
    mockedApiFetch.mockResolvedValue(mockData);
    renderAutobiography();
    await waitFor(() => {
      // Radiohead appears multiple times (top artist heading + top track artist)
      expect(screen.getAllByText("Radiohead").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders second and third artists", async () => {
    mockedApiFetch.mockResolvedValue(mockData);
    renderAutobiography();
    await waitFor(() => {
      expect(screen.getByText("Björk")).toBeTruthy();
    });
    expect(screen.getByText("Aphex Twin")).toBeTruthy();
  });

  it("renders top track info", async () => {
    mockedApiFetch.mockResolvedValue(mockData);
    renderAutobiography();
    await waitFor(() => {
      expect(
        screen.getByText("Everything In Its Right Place"),
      ).toBeTruthy();
    });
  });

  it("renders peak year", async () => {
    mockedApiFetch.mockResolvedValue(mockData);
    renderAutobiography();
    await waitFor(() => {
      expect(screen.getByText("2023")).toBeTruthy();
    });
  });

  it("renders night artist section", async () => {
    mockedApiFetch.mockResolvedValue(mockData);
    renderAutobiography();
    await waitFor(() => {
      expect(screen.getByText("Boards of Canada")).toBeTruthy();
    });
    expect(screen.getByText("真夜中の音楽")).toBeTruthy();
  });

  it("renders closing section", async () => {
    mockedApiFetch.mockResolvedValue(mockData);
    renderAutobiography();
    await waitFor(() => {
      expect(
        screen.getByText("これがあなたの音楽の地層です。"),
      ).toBeTruthy();
    });
  });

  it("calls apiFetch with /vault/autobiography", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    renderAutobiography();
    expect(mockedApiFetch).toHaveBeenCalledWith("/vault/autobiography");
  });
});
