import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Import from "./Import";

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn(),
}));

// Mock fflate to avoid actual zip processing in tests
vi.mock("fflate", () => ({
  unzipSync: vi.fn(() => ({})),
}));

import { apiFetch } from "../lib/api";

const mockedApiFetch = apiFetch as ReturnType<typeof vi.fn>;

async function renderImport() {
  let result: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <MemoryRouter>
        <Import />
      </MemoryRouter>,
    );
  });
  return result!;
}

const mockStatusWithData = {
  data: {
    hasData: true,
    totalTracks: 12345,
    dateRange: {
      from: "2020-01-01T00:00:00Z",
      to: "2025-12-31T00:00:00Z",
    },
  },
};

const mockStatusEmpty = {
  data: {
    hasData: false,
    totalTracks: 0,
    dateRange: null,
  },
};

describe("Import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches import status on mount", async () => {
    mockedApiFetch.mockResolvedValue(mockStatusEmpty);
    await renderImport();
    expect(mockedApiFetch).toHaveBeenCalledWith("/import/status");
  });

  it("renders page header", async () => {
    mockedApiFetch.mockResolvedValue(mockStatusEmpty);
    await renderImport();
    expect(screen.getByText("データインポート")).toBeTruthy();
  });

  it("renders instructions section", async () => {
    mockedApiFetch.mockResolvedValue(mockStatusEmpty);
    await renderImport();
    expect(
      screen.getByText("Extended Streaming History の取得方法"),
    ).toBeTruthy();
  });

  it("shows existing data status when has data", async () => {
    mockedApiFetch.mockResolvedValue(mockStatusWithData);
    await renderImport();
    expect(screen.getByText("インポート済みデータ")).toBeTruthy();
    expect(screen.getByText("12,345 トラック")).toBeTruthy();
  });

  it("shows delete button when has data", async () => {
    mockedApiFetch.mockResolvedValue(mockStatusWithData);
    await renderImport();
    expect(
      screen.getByText("インポートデータをすべて削除"),
    ).toBeTruthy();
  });

  it("does not show data status when no data", async () => {
    mockedApiFetch.mockResolvedValue(mockStatusEmpty);
    await renderImport();
    expect(screen.queryByText("インポート済みデータ")).toBeNull();
  });

  it("shows drop zone with upload prompt", async () => {
    mockedApiFetch.mockResolvedValue(mockStatusEmpty);
    await renderImport();
    expect(
      screen.getByText(
        "JSONまたはZIPファイルをドラッグ＆ドロップ、またはクリックして選択",
      ),
    ).toBeTruthy();
  });

  it("opens confirm dialog when delete button clicked", async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue(mockStatusWithData);
    await renderImport();

    expect(
      screen.getByText("インポートデータをすべて削除"),
    ).toBeTruthy();

    await user.click(screen.getByText("インポートデータをすべて削除"));
    expect(screen.getByText("インポートデータの削除")).toBeTruthy();
    expect(screen.getByText("すべて削除する")).toBeTruthy();
  });

  it("calls DELETE endpoint when confirm delete", async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockImplementation((path: string, opts?: RequestInit) => {
      if (path === "/import/status") return Promise.resolve(mockStatusWithData);
      if (path === "/import/data" && opts?.method === "DELETE")
        return Promise.resolve({ data: { success: true } });
      return Promise.reject(new Error("unexpected"));
    });

    await renderImport();

    expect(
      screen.getByText("インポートデータをすべて削除"),
    ).toBeTruthy();

    await user.click(screen.getByText("インポートデータをすべて削除"));
    await user.click(screen.getByText("すべて削除する"));

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith("/import/data", {
        method: "DELETE",
      });
    });
  });

  it("shows file type hint", async () => {
    mockedApiFetch.mockResolvedValue(mockStatusEmpty);
    await renderImport();
    expect(
      screen.getByText("複数ファイル対応（.json / .zip）"),
    ).toBeTruthy();
  });

  it("has a hidden file input with correct accept types", async () => {
    mockedApiFetch.mockResolvedValue(mockStatusEmpty);
    const { container } = await renderImport();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.accept).toBe(".json,.zip");
    expect(input.multiple).toBe(true);
  });
});
