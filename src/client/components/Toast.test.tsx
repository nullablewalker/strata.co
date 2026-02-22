import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, useToast } from "./Toast";

// Consumer component to trigger toasts in tests
function ToastTrigger() {
  const toast = useToast();
  return (
    <div>
      <button onClick={() => toast.success("Success message")}>
        Show Success
      </button>
      <button onClick={() => toast.error("Error message")}>Show Error</button>
      <button onClick={() => toast.info("Info message")}>Show Info</button>
    </div>
  );
}

describe("useToast", () => {
  it("throws when used outside ToastProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    function BadComponent() {
      useToast();
      return null;
    }

    expect(() => render(<BadComponent />)).toThrow(
      "useToast must be used within ToastProvider",
    );

    spy.mockRestore();
  });
});

describe("ToastProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders children", () => {
    render(
      <ToastProvider>
        <div>Child Content</div>
      </ToastProvider>,
    );

    expect(screen.getByText("Child Content")).toBeTruthy();
  });

  it("shows success toast with correct message", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    );

    await user.click(screen.getByText("Show Success"));

    expect(screen.getByText("Success message")).toBeTruthy();
    // Success toast has role="alert"
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("shows error toast with correct message", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    );

    await user.click(screen.getByText("Show Error"));

    expect(screen.getByText("Error message")).toBeTruthy();
  });

  it("shows info toast with correct message", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    );

    await user.click(screen.getByText("Show Info"));

    expect(screen.getByText("Info message")).toBeTruthy();
  });

  it("shows correct icon for each toast type", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    );

    await user.click(screen.getByText("Show Success"));
    expect(screen.getByText("✓")).toBeTruthy();

    // Dismiss and show next
    act(() => {
      vi.advanceTimersByTime(4100);
    });

    await user.click(screen.getByText("Show Error"));
    expect(screen.getByText("✕")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(4100);
    });

    await user.click(screen.getByText("Show Info"));
    expect(screen.getByText("ℹ")).toBeTruthy();
  });

  it("auto-dismisses toast after 4 seconds", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    );

    await user.click(screen.getByText("Show Success"));
    expect(screen.getByText("Success message")).toBeTruthy();

    // Advance time by 3.9s — should still be visible
    act(() => {
      vi.advanceTimersByTime(3900);
    });
    expect(screen.queryByText("Success message")).toBeTruthy();

    // Advance past 4s — should be dismissed
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByText("Success message")).toBeNull();
  });

  it("dismiss button removes toast immediately", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    );

    await user.click(screen.getByText("Show Success"));
    expect(screen.getByText("Success message")).toBeTruthy();

    // Find the dismiss button (the X button inside the toast alert)
    const alert = screen.getByRole("alert");
    const dismissButton = alert.querySelector("button")!;
    await user.click(dismissButton);

    expect(screen.queryByText("Success message")).toBeNull();
  });

  it("can show multiple toasts at once", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    );

    await user.click(screen.getByText("Show Success"));
    await user.click(screen.getByText("Show Error"));

    expect(screen.getByText("Success message")).toBeTruthy();
    expect(screen.getByText("Error message")).toBeTruthy();
  });
});
