/**
 * Reusable confirmation dialog with a semi-transparent overlay backdrop.
 *
 * Follows the same overlay pattern used in Layout.tsx for the mobile sidebar
 * (fixed inset-0 bg-black/50) and uses the app's dark theme color tokens
 * defined in index.css.
 *
 * The confirm button is styled as a destructive action (red) by default,
 * and supports a loading state that disables interaction and shows
 * "処理中..." (processing) text.
 */

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="mx-4 w-full max-w-md rounded-lg border border-strata-border bg-strata-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="mt-2 whitespace-pre-line text-sm text-zinc-400">
          {description}
        </p>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-md px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-white disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "処理中..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
