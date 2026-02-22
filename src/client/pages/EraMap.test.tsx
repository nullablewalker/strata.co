import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import EraMap from "./EraMap";

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

function renderEraMap() {
  return render(
    <MemoryRouter>
      <EraMap />
    </MemoryRouter>,
  );
}

const mockEraData = {
  data: {
    artists: ["Artist A", "Artist B", "Artist C"],
    months: [
      {
        month: "2024-01",
        values: { "Artist A": 3600000, "Artist B": 1800000, "Artist C": 900000 },
      },
      {
        month: "2024-02",
        values: { "Artist A": 2700000, "Artist B": 2400000, "Artist C": 1200000 },
      },
      {
        month: "2024-03",
        values: { "Artist A": 1800000, "Artist B": 3000000, "Artist C": 1500000 },
      },
    ],
  },
};

describe("EraMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders page header", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    renderEraMap();
    expect(screen.getByText("Era Map")).toBeTruthy();
    expect(screen.getByText("あなたの音楽地層")).toBeTruthy();
  });

  it("fetches era data on mount", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    renderEraMap();
    expect(mockedApiFetch).toHaveBeenCalledWith("/strata/eras");
  });

  it("shows loading skeleton while fetching", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderEraMap();
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("shows empty state when no data", async () => {
    mockedApiFetch.mockResolvedValue({
      data: { artists: [], months: [] },
    });
    renderEraMap();
    await waitFor(() => {
      expect(screen.getByText("データがありません")).toBeTruthy();
    });
    expect(screen.getByText("データをインポート")).toBeTruthy();
  });

  it("shows error state on fetch failure", async () => {
    mockedApiFetch.mockRejectedValue(new Error("Network error"));
    renderEraMap();
    await waitFor(() => {
      expect(
        screen.getByText("Failed to load era map data"),
      ).toBeTruthy();
    });
    expect(screen.getByText("Retry")).toBeTruthy();
  });

  it("renders legend with artist names when data loads", async () => {
    mockedApiFetch.mockResolvedValue(mockEraData);
    renderEraMap();
    await waitFor(() => {
      expect(screen.getByText("Artists")).toBeTruthy();
    });
    expect(screen.getByText("Artist A")).toBeTruthy();
    expect(screen.getByText("Artist B")).toBeTruthy();
    expect(screen.getByText("Artist C")).toBeTruthy();
  });

  it("renders SVG container when data loads", async () => {
    mockedApiFetch.mockResolvedValue(mockEraData);
    const { container } = renderEraMap();
    await waitFor(() => {
      expect(container.querySelector("svg")).toBeTruthy();
    });
  });
});
