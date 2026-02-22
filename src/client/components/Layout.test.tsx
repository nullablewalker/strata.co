import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Layout from "./Layout";

// Mock the auth module
vi.mock("../lib/auth", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "../lib/auth";

const mockedUseAuth = useAuth as ReturnType<typeof vi.fn>;
const mockLogout = vi.fn();

function renderLayout(initialEntries = ["/dashboard"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<div>Dashboard Page</div>} />
          <Route path="/vault" element={<div>Vault Page</div>} />
          <Route path="/import" element={<div>Import Page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("Layout", () => {
  beforeEach(() => {
    mockLogout.mockReset();
    mockedUseAuth.mockReturnValue({
      user: {
        id: "u1",
        spotifyId: "sp1",
        displayName: "Test User",
        email: "test@example.com",
        avatarUrl: "https://example.com/avatar.jpg",
      },
      isLoading: false,
      isAuthenticated: true,
      logout: mockLogout,
    });
  });

  it("renders navigation links", () => {
    renderLayout();

    expect(screen.getAllByText("Dashboard").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("The Vault").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Import").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Export").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Heatmap").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Patterns").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Era Map").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Autobiography").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Mosaic").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the Strata brand link", () => {
    renderLayout();

    // The sidebar has a "Strata" branding link and the mobile header has "Strata" text
    expect(screen.getAllByText("Strata").length).toBeGreaterThanOrEqual(1);
  });

  it("shows user display name", () => {
    renderLayout();

    expect(screen.getByText("Test User")).toBeTruthy();
  });

  it("shows avatar image when avatarUrl is provided", () => {
    const { container } = renderLayout();

    const avatar = container.querySelector("img");
    expect(avatar).toBeTruthy();
    expect(avatar!.getAttribute("src")).toBe("https://example.com/avatar.jpg");
  });

  it("shows initials fallback when no avatarUrl", () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: "u1",
        spotifyId: "sp1",
        displayName: "Alice",
        email: null,
        avatarUrl: null,
      },
      isLoading: false,
      isAuthenticated: true,
      logout: mockLogout,
    });

    renderLayout();

    // Should show "A" (first character of "Alice" uppercased)
    expect(screen.getByText("A")).toBeTruthy();
  });

  it("shows '?' fallback when no displayName", () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: "u1",
        spotifyId: "sp1",
        displayName: null,
        email: null,
        avatarUrl: null,
      },
      isLoading: false,
      isAuthenticated: true,
      logout: mockLogout,
    });

    renderLayout();

    expect(screen.getByText("?")).toBeTruthy();
    // Falls back to "User" for display name
    expect(screen.getByText("User")).toBeTruthy();
  });

  it("logout button calls logout", async () => {
    const user = userEvent.setup();
    renderLayout();

    const logoutButton = screen.getByText("Logout");
    await user.click(logoutButton);

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it("renders child route content via Outlet", () => {
    renderLayout(["/dashboard"]);

    expect(screen.getByText("Dashboard Page")).toBeTruthy();
  });

  it("shows section labels in navigation", () => {
    renderLayout();

    expect(screen.getAllByText("Library").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Insights").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Stories").length).toBeGreaterThanOrEqual(1);
  });

  it("has a hamburger button for mobile", () => {
    renderLayout();

    const hamburger = screen.getByLabelText("メニューを開く");
    expect(hamburger).toBeTruthy();
  });
});
