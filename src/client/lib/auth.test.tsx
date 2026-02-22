import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "./auth";

// Mock the api module to control apiFetch behavior per-test
vi.mock("./api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "./api";

const mockedApiFetch = apiFetch as ReturnType<typeof vi.fn>;

// Test component that consumes the auth context
function AuthConsumer() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="authenticated">{String(isAuthenticated)}</span>
      <span data-testid="user">{user ? user.displayName : "null"}</span>
      <button onClick={logout}>Logout</button>
    </div>
  );
}

describe("AuthProvider", () => {
  // Prevent window.location.href assignment from causing jsdom navigation errors
  const originalLocation = window.location;

  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...originalLocation, href: "/" },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: originalLocation,
    });
  });

  it("shows loading state initially", () => {
    // Never resolve the fetch — keeps isLoading=true
    mockedApiFetch.mockReturnValue(new Promise(() => {}));

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    expect(screen.getByTestId("loading").textContent).toBe("true");
    expect(screen.getByTestId("authenticated").textContent).toBe("false");
    expect(screen.getByTestId("user").textContent).toBe("null");
  });

  it("sets user after successful /auth/me fetch", async () => {
    mockedApiFetch.mockResolvedValue({
      data: {
        id: "u1",
        spotifyId: "sp1",
        displayName: "Alice",
        email: "alice@test.com",
        avatarUrl: null,
      },
    });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    expect(screen.getByTestId("user").textContent).toBe("Alice");
    expect(screen.getByTestId("authenticated").textContent).toBe("true");
  });

  it("sets user to null after failed /auth/me fetch", async () => {
    mockedApiFetch.mockRejectedValue(new Error("401 Unauthorized"));

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    expect(screen.getByTestId("user").textContent).toBe("null");
    expect(screen.getByTestId("authenticated").textContent).toBe("false");
  });

  it("isAuthenticated is true when user is set", async () => {
    mockedApiFetch.mockResolvedValue({
      data: {
        id: "u1",
        spotifyId: "sp1",
        displayName: "Bob",
        email: null,
        avatarUrl: null,
      },
    });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("authenticated").textContent).toBe("true");
    });
  });

  it("isAuthenticated is false when user is null", async () => {
    mockedApiFetch.mockRejectedValue(new Error("no session"));

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    expect(screen.getByTestId("authenticated").textContent).toBe("false");
  });

  it("logout calls POST /auth/logout", async () => {
    mockedApiFetch.mockResolvedValue({
      data: {
        id: "u1",
        spotifyId: "sp1",
        displayName: "Alice",
        email: null,
        avatarUrl: null,
      },
    });

    const user = userEvent.setup();

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    // Reset mock to check logout call specifically
    mockedApiFetch.mockResolvedValue({});

    await user.click(screen.getByRole("button", { name: "Logout" }));

    expect(mockedApiFetch).toHaveBeenCalledWith("/auth/logout", {
      method: "POST",
    });
  });

  it("logout sets user to null and redirects to /", async () => {
    mockedApiFetch.mockResolvedValue({
      data: {
        id: "u1",
        spotifyId: "sp1",
        displayName: "Alice",
        email: null,
        avatarUrl: null,
      },
    });

    const user = userEvent.setup();

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("Alice");
    });

    mockedApiFetch.mockResolvedValue({});

    await user.click(screen.getByRole("button", { name: "Logout" }));

    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("null");
    });
    expect(window.location.href).toBe("/");
  });

  it("calls /auth/me on mount", async () => {
    mockedApiFetch.mockResolvedValue({ data: null });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    expect(mockedApiFetch).toHaveBeenCalledWith("/auth/me");
  });
});

describe("useAuth", () => {
  it("throws when used outside AuthProvider", () => {
    // Suppress the React error boundary console output
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    function BadComponent() {
      useAuth();
      return null;
    }

    expect(() => render(<BadComponent />)).toThrow(
      "useAuth must be used within AuthProvider",
    );

    spy.mockRestore();
  });
});
