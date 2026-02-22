import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { unzipSync } from "fflate";
import { apiFetch } from "../lib/api";
import ConfirmDialog from "../components/ConfirmDialog";
import type { ImportResult, ImportStatus } from "../../shared/validators/history";

type UploadState = "idle" | "uploading" | "done" | "error";

interface FileProgress {
  name: string;
  status: "pending" | "uploading" | "done" | "error";
  result?: ImportResult;
  error?: string;
}

export default function Import() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<ImportStatus | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [files, setFiles] = useState<FileProgress[]>([]);
  const [totals, setTotals] = useState<ImportResult>({
    total: 0,
    imported: 0,
    skipped: 0,
    duplicates: 0,
  });
  const [dragOver, setDragOver] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteState, setDeleteState] = useState<"idle" | "deleting" | "done" | "error">("idle");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchStatus = useCallback(() => {
    apiFetch<{ data: ImportStatus }>("/import/status")
      .then((res) => setStatus(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const extractJsonFromZip = async (file: File): Promise<File[]> => {
    const buffer = await file.arrayBuffer();
    const unzipped = unzipSync(new Uint8Array(buffer));
    const jsonFiles: File[] = [];
    for (const [path, data] of Object.entries(unzipped)) {
      if (
        path.endsWith(".json") &&
        !path.startsWith("__MACOSX") &&
        !path.includes("/.__")
      ) {
        const copy = new Uint8Array(data.length);
        copy.set(data);
        const blob = new Blob([copy.buffer as ArrayBuffer], { type: "application/json" });
        const fileName = path.split("/").pop() || path;
        jsonFiles.push(
          new File([blob], fileName, { type: "application/json" }),
        );
      }
    }
    return jsonFiles;
  };

  const processFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const allFiles = Array.from(fileList);

      // Separate JSON and ZIP files
      const jsonFiles: File[] = allFiles.filter((f) =>
        f.name.endsWith(".json"),
      );
      const zipFiles = allFiles.filter((f) => f.name.endsWith(".zip"));

      // Extract JSON files from ZIPs
      for (const zip of zipFiles) {
        try {
          const extracted = await extractJsonFromZip(zip);
          jsonFiles.push(...extracted);
        } catch {
          console.error(`Failed to extract ${zip.name}`);
        }
      }

      if (jsonFiles.length === 0) {
        setUploadState("error");
        setFiles([{ name: "エラー", status: "error" }]);
        return;
      }

      setUploadState("uploading");
      const progress: FileProgress[] = jsonFiles.map((f) => ({
        name: f.name,
        status: "pending",
      }));
      setFiles([...progress]);

      const accumulated: ImportResult = {
        total: 0,
        imported: 0,
        skipped: 0,
        duplicates: 0,
      };

      let hasError = false;

      for (let i = 0; i < jsonFiles.length; i++) {
        progress[i].status = "uploading";
        setFiles([...progress]);

        try {
          const text = await jsonFiles[i].text();
          const json = JSON.parse(text);
          const res = await apiFetch<{ data: ImportResult }>("/import/history", {
            method: "POST",
            body: JSON.stringify(json),
          });

          progress[i].status = "done";
          progress[i].result = res.data;
          accumulated.total += res.data.total;
          accumulated.imported += res.data.imported;
          accumulated.skipped += res.data.skipped;
          accumulated.duplicates += res.data.duplicates;
        } catch (err) {
          progress[i].status = "error";
          progress[i].error =
            err instanceof Error ? err.message : "Unknown error";
          hasError = true;
        }

        setFiles([...progress]);
        setTotals({ ...accumulated });
      }

      setUploadState(hasError ? "error" : "done");

      // Refresh status
      fetchStatus();
    },
    [],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files);
      }
    },
    [processFiles],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        processFiles(e.target.files);
      }
    },
    [processFiles],
  );

  const handleDelete = async () => {
    setDeleteState("deleting");
    setDeleteError(null);
    try {
      await apiFetch("/import/data", { method: "DELETE" });
      setDeleteState("done");
      setDeleteDialogOpen(false);
      // Re-fetch import status to update UI
      fetchStatus();
    } catch (err) {
      setDeleteState("error");
      setDeleteError(err instanceof Error ? err.message : "データの削除に失敗しました");
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-bold text-strata-amber-300">
        データインポート
      </h1>
      <p className="mt-2 text-strata-slate-400">
        Spotifyの再生履歴データをStrataに取り込みます
      </p>

      {/* Existing data status */}
      {status?.hasData && (
        <div className="mt-6 rounded-lg border border-strata-border bg-strata-surface p-4">
          <p className="text-sm text-strata-slate-400">インポート済みデータ</p>
          <p className="mt-1 text-lg font-medium text-white">
            {status.totalTracks.toLocaleString()} トラック
          </p>
          {status.dateRange && (
            <p className="mt-1 text-sm text-strata-slate-400">
              {new Date(status.dateRange.from).toLocaleDateString("ja-JP")}
              {" - "}
              {new Date(status.dateRange.to).toLocaleDateString("ja-JP")}
            </p>
          )}
          <div className="mt-3">
            <button
              onClick={() => { setDeleteDialogOpen(true); setDeleteState("idle"); setDeleteError(null); }}
              className="text-sm text-red-400 hover:text-red-300 underline underline-offset-2"
            >
              インポートデータをすべて削除
            </button>
            {deleteError && (
              <p className="text-sm text-red-400 mt-2">{deleteError}</p>
            )}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-white">
          Extended Streaming History の取得方法
        </h2>
        <ol className="mt-4 space-y-3 text-sm text-strata-slate-400">
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-strata-amber-500/20 text-xs font-medium text-strata-amber-300">
              1
            </span>
            <span>
              Spotifyアカウント設定 &rarr; プライバシー設定 &rarr;
              データをダウンロード
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-strata-amber-500/20 text-xs font-medium text-strata-amber-300">
              2
            </span>
            <span>「Extended streaming history」を選択してリクエスト</span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-strata-amber-500/20 text-xs font-medium text-strata-amber-300">
              3
            </span>
            <span>
              数日〜30日後にメールでダウンロードリンクが届きます
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-strata-amber-500/20 text-xs font-medium text-strata-amber-300">
              4
            </span>
            <span>
              JSONファイルまたはZIPファイルをそのままアップロードしてください
            </span>
          </li>
        </ol>
      </div>

      {/* Drop zone */}
      <div
        className={`mt-8 flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
          dragOver
            ? "border-strata-amber-400 bg-strata-amber-500/10"
            : "border-strata-border bg-strata-surface hover:border-strata-slate-500"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.zip"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
        <svg
          className="h-10 w-10 text-strata-slate-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <p className="mt-3 text-sm text-strata-slate-400">
          JSONまたはZIPファイルをドラッグ＆ドロップ、またはクリックして選択
        </p>
        <p className="mt-1 text-xs text-strata-slate-500">
          複数ファイル対応（.json / .zip）
        </p>
      </div>

      {/* File progress */}
      {files.length > 0 && (
        <div className="mt-6 space-y-2">
          {files.map((f, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border border-strata-border bg-strata-surface px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm text-white">
                  {f.name}
                </p>
                {f.result && (
                  <p className="mt-0.5 text-xs text-strata-slate-400">
                    {f.result.imported.toLocaleString()} 件インポート /
                    {" "}{f.result.skipped.toLocaleString()} 件スキップ /
                    {" "}{f.result.duplicates.toLocaleString()} 件重複
                  </p>
                )}
                {f.error && (
                  <p className="mt-0.5 text-xs text-red-400">{f.error}</p>
                )}
              </div>
              <div className="ml-3 shrink-0">
                {f.status === "pending" && (
                  <span className="text-xs text-strata-slate-500">待機中</span>
                )}
                {f.status === "uploading" && (
                  <span className="text-xs text-strata-amber-300">
                    処理中...
                  </span>
                )}
                {f.status === "done" && (
                  <span className="text-xs text-strata-green-400">完了</span>
                )}
                {f.status === "error" && (
                  <span className="text-xs text-red-400">エラー</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Totals summary */}
      {uploadState === "done" && (
        <div className="mt-6 rounded-lg border border-strata-amber-500/30 bg-strata-amber-500/10 p-5">
          <h3 className="font-semibold text-strata-amber-300">
            インポート完了
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-strata-slate-400">合計</p>
              <p className="text-lg font-medium text-white">
                {totals.total.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-strata-slate-400">インポート</p>
              <p className="text-lg font-medium text-strata-green-400">
                {totals.imported.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-strata-slate-400">スキップ</p>
              <p className="text-lg font-medium text-strata-slate-400">
                {totals.skipped.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-strata-slate-400">重複</p>
              <p className="text-lg font-medium text-strata-slate-400">
                {totals.duplicates.toLocaleString()}
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate("/vault")}
            className="mt-5 rounded-lg bg-strata-amber-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-strata-amber-400"
          >
            The Vault へ
          </button>
        </div>
      )}

      {uploadState === "error" && (
        <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm text-red-400">
            一部のファイルでエラーが発生しました。ファイル形式を確認して再度お試しください。
          </p>
        </div>
      )}

      <ConfirmDialog
        open={deleteDialogOpen}
        title="インポートデータの削除"
        description={"すべての再生履歴データが完全に削除されます。\nこの操作は取り消せません。"}
        confirmLabel="すべて削除する"
        loading={deleteState === "deleting"}
        onConfirm={handleDelete}
        onCancel={() => setDeleteDialogOpen(false)}
      />
    </div>
  );
}
