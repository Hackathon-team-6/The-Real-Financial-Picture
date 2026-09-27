"use client";

import { AlertCircle, CheckCircle2, FileSpreadsheet, FileText, Loader2, UploadCloud, X } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { cn } from "@/lib/format";

export type FileStatus = "ready" | "processing" | "done" | "error";

export interface UploadItem {
  id: string;
  file: File;
  status: FileStatus;
  message?: string;
}

const ACCEPT = ".csv,.pdf,.txt,text/csv,application/pdf";

export function fileKind(file: File): "csv" | "pdf" | "unsupported" {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt") || file.type === "text/csv") return "csv";
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  return "unsupported";
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function UploadBox({ items, onAdd, onRemove, disabled }: { items: UploadItem[]; onAdd: (files: File[]) => void; onRemove: (id: string) => void; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) onAdd(files);
  };

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex w-full flex-col items-center justify-center rounded-[28px] border-2 border-dashed px-6 py-10 text-center transition",
          dragging ? "scale-[1.01] border-ink bg-card" : "border-line bg-card/60 hover:border-subtle hover:bg-card",
        )}
      >
        <div className="grid size-14 place-items-center rounded-2xl bg-ink text-lime">
          <UploadCloud size={26} />
        </div>
        <p className="mt-4 text-[16px] font-semibold tracking-tight">Drop files here</p>
        <p className="mt-1 text-[14px] text-muted">or tap to browse</p>
        <p className="mt-3 text-[12px] font-semibold tracking-[0.12em] text-subtle">CSV • PDF</p>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onAdd(files);
          e.target.value = "";
        }}
      />

      {items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {items.map((it) => {
            const kind = fileKind(it.file);
            const Icon = kind === "pdf" ? FileText : FileSpreadsheet;
            return (
              <li key={it.id} className="flex animate-rise items-center gap-3 rounded-2xl border border-line bg-card p-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-line-2">
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{it.file.name}</p>
                  <p className={cn("truncate text-[12px]", it.status === "error" ? "text-neg" : "text-muted")}>
                    {kind.toUpperCase()} · {sizeLabel(it.file.size)}
                    {it.message ? ` · ${it.message}` : it.status === "processing" ? " · Processing…" : it.status === "ready" ? " · Ready" : ""}
                  </p>
                </div>
                {it.status === "processing" && <Loader2 size={18} className="animate-spin text-muted" />}
                {it.status === "done" && <CheckCircle2 size={18} className="text-pos" />}
                {it.status === "error" && <AlertCircle size={18} className="text-neg" />}
                {it.status !== "processing" && (
                  <button onClick={() => onRemove(it.id)} className="grid size-9 place-items-center rounded-full text-muted hover:bg-line-2 hover:text-ink" aria-label={`Remove ${it.file.name}`}>
                    <X size={16} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
