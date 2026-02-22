import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Patterns from "./Patterns";

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

function renderPatterns() {
  return render(
    <MemoryRouter>
      <Patterns />
    </MemoryRouter>,
  );
}

const mockOverview = {
  data: {
    peakHour: { hour: 22, label: "夜更け" },
    busiestDay: { day: 5, dayName: "金" },
    favoriteSeason: "冬",
    averageDailyPlays: 35,
    listenerType: "Night Owl",
    availableYears: [2025, 2024, 2023],
  },
};

const mockHourly = {
  data: Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    count: i === 22 ? 1000 : Math.floor(Math.random() * 500),
    msPlayed: 3600000,
  })),
};

const mockWeekly = {
  data: Array.from({ length: 7 }, (_, i) => ({
    day: i,
    dayName: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i],
    count: 500 + i * 100,
    msPlayed: 7200000,
  })),
};

const mockMonthly = {
  data: Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    monthName: [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ][i],
    count: 1000 + i * 200,
    msPlayed: 36000000,
  })),
};

const mockTimeArtists = {
  data: {
    night: {
      label: "深夜",
      artists: [{ artistName: "Night Artist", playCount: 100, msPlayed: 360000 }],
    },
    morning: {
      label: "朝",
      artists: [{ artistName: "Morning Artist", playCount: 80, msPlayed: 288000 }],
    },
    daytime: {
      label: "昼",
      artists: [{ artistName: "Day Artist", playCount: 120, msPlayed: 432000 }],
    },
    evening: {
      label: "夕方",
      artists: [{ artistName: "Evening Artist", playCount: 90, msPlayed: 324000 }],
    },
  },
};

const mockDevices = { data: [] };
const mockShuffle = { data: { shufflePlays: 0, intentionalPlays: 0, total: 0 } };

function setupMocks() {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path.includes("/patterns/overview")) return Promise.resolve(mockOverview);
    if (path.includes("/patterns/hourly")) return Promise.resolve(mockHourly);
    if (path.includes("/patterns/weekly")) return Promise.resolve(mockWeekly);
    if (path.includes("/patterns/monthly")) return Promise.resolve(mockMonthly);
    if (path.includes("/patterns/time-artists")) return Promise.resolve(mockTimeArtists);
    if (path.includes("/patterns/devices")) return Promise.resolve(mockDevices);
    if (path.includes("/patterns/shuffle")) return Promise.resolve(mockShuffle);
    return Promise.reject(new Error("unexpected"));
  });
}

describe("Patterns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders page header", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    renderPatterns();
    expect(screen.getByText("Listening Patterns")).toBeTruthy();
  });

  it("shows loading skeleton while fetching", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderPatterns();
    expect(container.querySelector(".shimmer")).toBeTruthy();
  });

  it("shows listener type badge after data loads", async () => {
    setupMocks();
    renderPatterns();
    await waitFor(() => {
      expect(screen.getByText("Night Owl")).toBeTruthy();
    });
  });

  it("shows year selector", async () => {
    setupMocks();
    const { container } = renderPatterns();
    await waitFor(() => {
      const select = container.querySelector("select") as HTMLSelectElement;
      expect(select).toBeTruthy();
      const options = Array.from(select.options).map((o) => o.text);
      expect(options).toContain("すべて");
    });
  });

  it("fetches all pattern endpoints on mount", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    renderPatterns();

    const calls = mockedApiFetch.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls.some((c) => c.includes("/patterns/overview"))).toBe(true);
    expect(calls.some((c) => c.includes("/patterns/hourly"))).toBe(true);
    expect(calls.some((c) => c.includes("/patterns/weekly"))).toBe(true);
    expect(calls.some((c) => c.includes("/patterns/monthly"))).toBe(true);
  });

  it("shows error state on failure", async () => {
    mockedApiFetch.mockRejectedValue(new Error("Network error"));
    renderPatterns();
    await waitFor(() => {
      expect(screen.getByText("データの取得に失敗しました")).toBeTruthy();
    });
    expect(screen.getByText("再試行")).toBeTruthy();
  });

  it("shows chart section titles after data loads", async () => {
    setupMocks();
    renderPatterns();
    await waitFor(() => {
      expect(screen.getByText("時間帯別リスニング")).toBeTruthy();
    });
    expect(screen.getByText("曜日別リスニング")).toBeTruthy();
    expect(screen.getByText("月別リスニング")).toBeTruthy();
  });

  it("shows overview stat cards", async () => {
    setupMocks();
    renderPatterns();
    await waitFor(() => {
      expect(screen.getByText("ピークタイム")).toBeTruthy();
    });
    expect(screen.getByText("22:00")).toBeTruthy();
    expect(screen.getByText("最も聴く曜日")).toBeTruthy();
    expect(screen.getByText("好きな季節")).toBeTruthy();
    expect(screen.getByText("冬")).toBeTruthy();
  });
});
