import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

// Mock the auth module
vi.mock("./lib/auth", () => {
  const actual = vi.importActual("./lib/auth");
  return {
    ...actual,
    AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useAuth: vi.fn(),
  };
});

// Mock all page components to isolate route testing
vi.mock("./pages/Dashboard", () => ({
  default: () => <div data-testid="dashboard-page">Dashboard Page</div>,
}));
vi.mock("./pages/Vault", () => ({
  default: () => <div data-testid="vault-page">Vault Page</div>,
}));
vi.mock("./pages/Heatmap", () => ({
  default: () => <div data-testid="heatmap-page">Heatmap Page</div>,
}));
vi.mock("./pages/Patterns", () => ({
  default: () => <div data-testid="patterns-page">Patterns Page</div>,
}));
vi.mock("./pages/EraMap", () => ({
  default: () => <div data-testid="era-map-page">Era Map Page</div>,
}));
vi.mock("./pages/Mosaic", () => ({
  default: () => <div data-testid="mosaic-page">Mosaic Page</div>,
}));
vi.mock("./pages/Import", () => ({
  default: () => <div data-testid="import-page">Import Page</div>,
}));
vi.mock("./pages/Autobiography", () => ({
  default: () => <div data-testid="autobiography-page">Autobiography Page</div>,
}));
vi.mock("./pages/Export", () => ({
  default: () => <div data-testid="export-page">Export Page</div>,
}));

// Mock Layout to just render children via Outlet
vi.mock("./components/Layout", () => {
  const { Outlet } = require("react-router-dom");
  return {
    default: () => (
      <div data-testid="layout">
        <Outlet />
      </div>
    ),
  };
});

import { useAuth } from "./lib/auth";

const mockedUseAuth = useAuth as ReturnType<typeof vi.fn>;

function renderApp(route = "/") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Landing page at '/' when not authenticated", () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      logout: vi.fn(),
    });

    renderApp("/");
    expect(screen.getByText("Strata")).toBeTruthy();
    expect(screen.getByText("Spotifyでログイン")).toBeTruthy();
  });

  it("shows loading spinner at '/' while auth is loading", () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      isLoading: true,
      isAuthenticated: false,
      logout: vi.fn(),
    });

    const { container } = renderApp("/");
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("redirects to /dashboard when authenticated at '/'", async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: "u1",
        spotifyId: "sp1",
        displayName: "Test",
        email: null,
        avatarUrl: null,
      },
      isLoading: false,
      isAuthenticated: true,
      logout: vi.fn(),
    });

    renderApp("/");
    await waitFor(() => {
      expect(screen.getByTestId("dashboard-page")).toBeTruthy();
    });
  });

  it("renders Dashboard at /dashboard when authenticated", async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: "u1",
        spotifyId: "sp1",
        displayName: "Test",
        email: null,
        avatarUrl: null,
      },
      isLoading: false,
      isAuthenticated: true,
      logout: vi.fn(),
    });

    renderApp("/dashboard");
    await waitFor(() => {
      expect(screen.getByTestId("dashboard-page")).toBeTruthy();
    });
  });

  it("redirects protected routes to / when not authenticated", () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      logout: vi.fn(),
    });

    renderApp("/vault");
    // Should not show vault page
    expect(screen.queryByTestId("vault-page")).toBeNull();
    // Should show landing page content (redirected to /)
    expect(screen.getByText("Spotifyでログイン")).toBeTruthy();
  });
});
