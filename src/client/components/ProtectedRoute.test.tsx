import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";

// Mock the auth module so we can control useAuth() return values
vi.mock("../lib/auth", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "../lib/auth";

const mockedUseAuth = useAuth as ReturnType<typeof vi.fn>;

// Helper to render ProtectedRoute within a router
function renderProtectedRoute(children: React.ReactNode = <div>Protected Content</div>) {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <ProtectedRoute>{children}</ProtectedRoute>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  it("shows loading spinner when isLoading is true", () => {
    mockedUseAuth.mockReturnValue({
      isLoading: true,
      isAuthenticated: false,
      user: null,
      logout: vi.fn(),
    });

    const { container } = renderProtectedRoute();

    // Should show the spinner (animate-spin class on a div)
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeTruthy();

    // Should NOT show children
    expect(screen.queryByText("Protected Content")).toBeNull();
  });

  it("redirects to / when not authenticated and not loading", () => {
    mockedUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
      user: null,
      logout: vi.fn(),
    });

    renderProtectedRoute();

    // Navigate component renders nothing visible, so children should not be present
    expect(screen.queryByText("Protected Content")).toBeNull();
  });

  it("renders children when authenticated", () => {
    mockedUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      user: {
        id: "u1",
        spotifyId: "sp1",
        displayName: "Alice",
        email: null,
        avatarUrl: null,
      },
      logout: vi.fn(),
    });

    renderProtectedRoute();

    expect(screen.getByText("Protected Content")).toBeTruthy();
  });

  it("does not show spinner when authenticated", () => {
    mockedUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      user: {
        id: "u1",
        spotifyId: "sp1",
        displayName: "Alice",
        email: null,
        avatarUrl: null,
      },
      logout: vi.fn(),
    });

    const { container } = renderProtectedRoute();

    expect(container.querySelector(".animate-spin")).toBeNull();
  });
});
