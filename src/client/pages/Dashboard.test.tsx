import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Dashboard from "./Dashboard";

vi.mock("../lib/auth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { useAuth } from "../lib/auth";
import { apiFetch } from "../lib/api";

const mockedUseAuth = useAuth as ReturnType<typeof vi.fn>;
const mockedApiFetch = apiFetch as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(performance.now() + 2000);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

const mockUser = {
  id: "u1",
  spotifyId: "sp1",
  displayName: "Test User",
  email: "test@example.com",
  avatarUrl: null,
};

const mockStats = {
  data: {
    totalTracks: 5000,
    totalArtists: 300,
    totalMsPlayed: 36_000_000_000, // 10000 hours
  },
};

const mockTimeCapsule = {
  data: [
    {
      yearsAgo: 1,
      date: "2025-02-22",
      tracks: [
        {
          trackName: "Capsule Track",
          artistName: "Capsule Artist",
          albumName: "Capsule Album",
          trackSpotifyId: "sp_capsule_1",
          totalMsPlayed: 240000,
          firstPlayedAt: "2025-02-22T10:00:00Z",
          playCount: 3,
        },
      ],
    },
  ],
};

const mockDormant = { data: [] };
const mockEngagement = { data: { completionRate: null, activeSelectionRate: null } };

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseAuth.mockReturnValue({
      user: mockUser,
      isLoading: false,
      isAuthenticated: true,
      logout: vi.fn(),
    });
  });

  it("shows loading skeleton initially", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderDashboard();
    expect(container.querySelector(".shimmer")).toBeTruthy();
  });

  it("shows welcome message with user name", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    renderDashboard();
    expect(screen.getByText("Welcome back, Test User")).toBeTruthy();
  });

  it("shows import CTA when no history", async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path.includes("/vault/stats")) return Promise.reject(new Error("No data"));
      if (path.includes("/vault/time-capsule")) return Promise.resolve({ data: [] });
      if (path.includes("/heatmap/summary")) return Promise.resolve(mockEngagement);
      return Promise.reject(new Error("unexpected"));
    });

    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Get Started")).toBeTruthy();
    });
    expect(screen.getByText("Import History")).toBeTruthy();
  });

  it("shows stat tiles when data exists", async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path.includes("/vault/stats")) return Promise.resolve(mockStats);
      if (path.includes("/vault/time-capsule")) return Promise.resolve({ data: [] });
      if (path.includes("/vault/dormant-artists")) return Promise.resolve(mockDormant);
      if (path.includes("/vault/drift-report"))
        return Promise.reject(new Error("no drift"));
      if (path.includes("/heatmap/summary")) return Promise.resolve(mockEngagement);
      return Promise.reject(new Error("unexpected"));
    });

    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Tracks")).toBeTruthy();
    });
    expect(screen.getByText("Artists")).toBeTruthy();
    expect(screen.getByText("Hours")).toBeTruthy();
  });

  it("shows time capsule section when capsule data exists", async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path.includes("/vault/stats")) return Promise.resolve(mockStats);
      if (path.includes("/vault/time-capsule")) return Promise.resolve(mockTimeCapsule);
      if (path.includes("/vault/dormant-artists")) return Promise.resolve(mockDormant);
      if (path.includes("/vault/drift-report"))
        return Promise.reject(new Error("no drift"));
      if (path.includes("/heatmap/summary")) return Promise.resolve(mockEngagement);
      return Promise.reject(new Error("unexpected"));
    });

    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("あの日のあなた")).toBeTruthy();
    });
    expect(screen.getByText("Capsule Track")).toBeTruthy();
    expect(screen.getByText("Capsule Artist")).toBeTruthy();
  });

  it("renders navigation tiles with correct links", async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path.includes("/vault/stats")) return Promise.resolve(mockStats);
      if (path.includes("/vault/time-capsule")) return Promise.resolve({ data: [] });
      if (path.includes("/vault/dormant-artists")) return Promise.resolve(mockDormant);
      if (path.includes("/vault/drift-report"))
        return Promise.reject(new Error("no drift"));
      if (path.includes("/heatmap/summary")) return Promise.resolve(mockEngagement);
      return Promise.reject(new Error("unexpected"));
    });

    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("The Vault")).toBeTruthy();
    });
    expect(screen.getByText("Fandom Heatmap")).toBeTruthy();
    expect(screen.getByText("Patterns")).toBeTruthy();
  });

  it("shows dormant artists when data present", async () => {
    const dormantData = {
      data: [
        {
          artistName: "Dormant Band",
          totalMsPlayed: 7_200_000,
          playCount: 50,
          lastPlayed: "2024-06-01T00:00:00Z",
        },
      ],
    };

    mockedApiFetch.mockImplementation((path: string) => {
      if (path.includes("/vault/stats")) return Promise.resolve(mockStats);
      if (path.includes("/vault/time-capsule")) return Promise.resolve({ data: [] });
      if (path.includes("/vault/dormant-artists")) return Promise.resolve(dormantData);
      if (path.includes("/vault/drift-report"))
        return Promise.reject(new Error("no drift"));
      if (path.includes("/heatmap/summary")) return Promise.resolve(mockEngagement);
      return Promise.reject(new Error("unexpected"));
    });

    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("眠れるアーティスト")).toBeTruthy();
    });
    expect(screen.getByText("Dormant Band")).toBeTruthy();
  });

  it("shows drift report when data present", async () => {
    const driftData = {
      data: {
        currentMonth: "2026-02",
        prevMonth: "2026-01",
        current: {
          artists: [{ artistName: "Rising Star", playCount: 50, msPlayed: 3600000 }],
          stats: { totalPlays: 200, totalMs: 7200000, uniqueArtists: 10, uniqueTracks: 50 },
        },
        previous: {
          artists: [{ artistName: "Old Fave", playCount: 30, msPlayed: 1800000 }],
          stats: { totalPlays: 150, totalMs: 5400000, uniqueArtists: 8, uniqueTracks: 40 },
        },
        rising: [{ artistName: "Rising Star", playCount: 50, msPlayed: 3600000 }],
        fading: [{ artistName: "Old Fave", playCount: 30, msPlayed: 1800000 }],
      },
    };

    mockedApiFetch.mockImplementation((path: string) => {
      if (path.includes("/vault/stats")) return Promise.resolve(mockStats);
      if (path.includes("/vault/time-capsule")) return Promise.resolve({ data: [] });
      if (path.includes("/vault/dormant-artists")) return Promise.resolve(mockDormant);
      if (path.includes("/vault/drift-report")) return Promise.resolve(driftData);
      if (path.includes("/heatmap/summary")) return Promise.resolve(mockEngagement);
      return Promise.reject(new Error("unexpected"));
    });

    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("今月のドリフト")).toBeTruthy();
    });
    expect(screen.getByText("浮上中")).toBeTruthy();
    expect(screen.getByText("沈降中")).toBeTruthy();
  });

  it("fetches vault stats on mount", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    renderDashboard();
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/vault/stats",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("shows subtitle", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    renderDashboard();
    expect(screen.getByText("Your personal music archive")).toBeTruthy();
  });

  it("shows geological signature when data loaded", async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path.includes("/vault/stats")) return Promise.resolve(mockStats);
      if (path.includes("/vault/time-capsule")) return Promise.resolve({ data: [] });
      if (path.includes("/vault/dormant-artists")) return Promise.resolve(mockDormant);
      if (path.includes("/vault/drift-report"))
        return Promise.reject(new Error("no drift"));
      if (path.includes("/heatmap/summary")) return Promise.resolve(mockEngagement);
      return Promise.reject(new Error("unexpected"));
    });

    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("── あなたの音楽の地層 ──")).toBeTruthy();
    });
  });
});
