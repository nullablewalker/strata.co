import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfirmDialog from "./ConfirmDialog";

const defaultProps = {
  open: true,
  title: "Delete Data",
  description: "Are you sure you want to delete all data?",
  confirmLabel: "Delete",
  loading: false,
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

function renderDialog(overrides = {}) {
  return render(<ConfirmDialog {...defaultProps} {...overrides} />);
}

describe("ConfirmDialog", () => {
  it("returns null when open is false", () => {
    const { container } = renderDialog({ open: false });

    expect(container.innerHTML).toBe("");
  });

  it("renders title when open", () => {
    renderDialog();

    expect(screen.getByText("Delete Data")).toBeTruthy();
  });

  it("renders description when open", () => {
    renderDialog();

    expect(
      screen.getByText("Are you sure you want to delete all data?"),
    ).toBeTruthy();
  });

  it("renders confirm button with provided label", () => {
    renderDialog();

    expect(screen.getByText("Delete")).toBeTruthy();
  });

  it("renders cancel button with Japanese label", () => {
    renderDialog();

    expect(screen.getByText("キャンセル")).toBeTruthy();
  });

  it("calls onConfirm when confirm button is clicked", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    renderDialog({ onConfirm });

    await user.click(screen.getByText("Delete"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    renderDialog({ onCancel });

    await user.click(screen.getByText("キャンセル"));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons when loading is true", () => {
    renderDialog({ loading: true });

    const confirmBtn = screen.getByText("処理中...");
    const cancelBtn = screen.getByText("キャンセル");

    expect(confirmBtn).toBeDisabled();
    expect(cancelBtn).toBeDisabled();
  });

  it("shows '処理中...' instead of confirm label when loading", () => {
    renderDialog({ loading: true });

    expect(screen.getByText("処理中...")).toBeTruthy();
    expect(screen.queryByText("Delete")).toBeNull();
  });

  it("calls onCancel when backdrop is clicked", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    const { container } = renderDialog({ onCancel });

    // Click on the backdrop (the outermost fixed div)
    const backdrop = container.firstElementChild!;
    await user.click(backdrop);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not call onCancel when dialog content is clicked", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    renderDialog({ onCancel });

    // Click on the title (inside the dialog, stopPropagation prevents onCancel)
    await user.click(screen.getByText("Delete Data"));

    expect(onCancel).not.toHaveBeenCalled();
  });
});
