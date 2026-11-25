"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CloudDownload, FileArchive, FileText, FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface DriveListItem {
  id: string;
  driveFileId: string;
  name: string;
  mimeType: string;
  size: number;
  kind?: string;
  createdAt: string | null;
}

declare global {
  interface Window {
    gapi?: {
      load: (api: string, cb: () => void) => void;
    };
    google?: {
      picker?: {
        ViewId: { DOCS: string };
        DocsView: new (viewId: string) => {
          setMimeTypes: (mimes: string) => unknown;
          setIncludeFolders: (v: boolean) => unknown;
        };
        PickerBuilder: new () => {
          addView: (view: unknown) => unknown;
          setOAuthToken: (token: string) => unknown;
          setDeveloperKey: (key: string) => unknown;
          setAppId: (appId: string) => unknown;
          setCallback: (
            cb: (data: {
              action: string;
              docs?: Array<{ id: string; name: string; mimeType: string }>;
            }) => void
          ) => unknown;
          build: () => { setVisible: (v: boolean) => void };
        };
        Action: { PICKED: string };
      };
    };
  }
}

function loadGooglePickerScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.picker) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://apis.google.com/js/api.js"]'
    );
    const onGapiReady = () => {
      if (!window.gapi) {
        reject(new Error("gapi unavailable"));
        return;
      }
      window.gapi.load("picker", () => resolve());
    };
    if (existing) {
      if (window.gapi) onGapiReady();
      else existing.addEventListener("load", onGapiReady, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.onload = onGapiReady;
    script.onerror = () => reject(new Error("Could not load Google Picker API"));
    document.head.appendChild(script);
  });
}

export function DriveImportDialog({
  open,
  onOpenChange,
  pickerConfigured,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pickerConfigured: boolean;
  onImported: (worksheets: Array<{ id: string; title: string }>) => void;
}) {
  const { tr } = useI18n();
  const [search, setSearch] = useState("");
  const [importingId, setImportingId] = useState<string | null>(null);
  const [openingPicker, setOpeningPicker] = useState(false);

  const { data, isLoading } = useQuery<{ files: DriveListItem[] }>({
    queryKey: ["drive-import-files", search],
    enabled: open,
    queryFn: () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      return apiFetchJson<{ files: DriveListItem[] }>(`/api/drive/files?${params.toString()}`);
    },
  });

  const runImport = async (driveFileId: string, fileName?: string, mimeType?: string) => {
    setImportingId(driveFileId);
    try {
      const res = await apiFetchJson<{ worksheets: Array<{ id: string; title: string }> }>(
        "/api/drive/import",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driveFileId, fileName, mimeType }),
        }
      );
      toast.success(
        tr(
          `Đã nhập ${res.worksheets.length} worksheet từ Google Drive!`,
          `Imported ${res.worksheets.length} worksheet(s) from Google Drive!`
        )
      );
      onImported(res.worksheets);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Nhập từ Drive thất bại", "Drive import failed"));
    } finally {
      setImportingId(null);
    }
  };

  const openGooglePicker = async () => {
    setOpeningPicker(true);
    try {
      const { accessToken, apiKey, clientId } = await apiFetchJson<{
        accessToken: string;
        apiKey: string;
        clientId: string;
      }>("/api/drive/picker-token");
      await loadGooglePickerScript();
      const pickerApi = window.google?.picker;
      if (!pickerApi) throw new Error("Google Picker unavailable");

      const view = new pickerApi.DocsView(pickerApi.ViewId.DOCS);
      view.setMimeTypes(
        "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/zip,application/json,text/plain"
      );
      view.setIncludeFolders(true);

      const appId = clientId.split("-")[0] ?? "";
      const builder = new pickerApi.PickerBuilder();
      builder.addView(view);
      builder.setOAuthToken(accessToken);
      builder.setDeveloperKey(apiKey);
      if (appId) builder.setAppId(appId);
      builder.setCallback((cbData) => {
        if (cbData.action === pickerApi.Action.PICKED && cbData.docs?.[0]) {
          const doc = cbData.docs[0];
          void runImport(doc.id, doc.name, doc.mimeType);
        }
      });
      builder.build().setVisible(true);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : tr("Không mở được Google Picker.", "Could not open Google Picker.")
      );
    } finally {
      setOpeningPicker(false);
    }
  };

  const importableFiles = (data?.files ?? []).filter((f) => {
    const lower = f.name.toLowerCase();
    return (
      lower.endsWith(".pdf") ||
      lower.endsWith(".docx") ||
      lower.endsWith(".zip") ||
      lower.endsWith(".json") ||
      lower.endsWith(".txt")
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{tr("Nhập Worksheet từ Google Drive", "Import worksheet from Google Drive")}</DialogTitle>
          <DialogDescription>
            {tr(
              "Chọn file PDF, Word (.docx) hoặc gói backup (.engclass.zip) từ Google Drive để tạo worksheet mới.",
              "Pick a PDF, Word (.docx), or backup (.engclass.zip) file from Google Drive to create a new worksheet."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {pickerConfigured && (
            <div className="rounded-xl border border-indigo-200 bg-[#EEF2FF]/60 p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-[#3525CD]">
                  {tr("Mở Google Picker", "Open Google Picker")}
                </p>
                <p className="text-[11px] text-[#464555]">
                  {tr(
                    "Chọn bất kỳ file PDF, DOCX hoặc .engclass.zip nào từ Google Drive của bạn.",
                    "Browse any PDF, DOCX, or .engclass.zip file in your Google Drive."
                  )}
                </p>
              </div>
              <Button size="sm" onClick={openGooglePicker} disabled={openingPicker}>
                {openingPicker ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FolderOpen className="h-4 w-4" />
                )}
                {tr("Chọn trên Drive", "Browse Drive")}
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr("Tìm file đã lưu trong Pivora trên Drive…", "Search Pivora Drive files…")}
              className="h-9 text-xs"
            />

            <div className="max-h-72 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 p-2">
              {isLoading ? (
                <p className="py-8 text-center text-xs text-slate-400">
                  {tr("Đang tải danh sách file…", "Loading files…")}
                </p>
              ) : importableFiles.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-400">
                  {tr(
                    "Chưa có file PDF / DOCX / Backup nào trong Pivora trên Drive.",
                    "No PDF / DOCX / Backup files found in Pivora Drive yet."
                  )}
                </p>
              ) : (
                importableFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-[#F8F9FF] px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {file.name.toLowerCase().endsWith(".zip") ? (
                        <FileArchive className="h-4 w-4 shrink-0 text-emerald-600" />
                      ) : (
                        <FileText className="h-4 w-4 shrink-0 text-[#4F46E5]" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[#0B1C30]">{file.name}</p>
                        <p className="text-[11px] text-slate-400">
                          {Math.max(1, Math.round(file.size / 1024))} KB
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={importingId === file.driveFileId}
                      data-testid={`drive-import-file-${file.driveFileId}`}
                      onClick={() => void runImport(file.driveFileId, file.name, file.mimeType)}
                    >
                      {importingId === file.driveFileId ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CloudDownload className="h-3.5 w-3.5" />
                      )}
                      {tr("Nhập", "Import")}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
