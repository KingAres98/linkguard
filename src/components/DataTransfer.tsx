"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import type { DashboardBackend } from "@/lib/dashboard/backend";
import type { ImportKind, ImportSummary } from "@/lib/portability/apply-import";
import { MAX_BACKUP_BYTES, createBackup, serializeBackup } from "@/lib/portability/backup";
import { describeImport, hasChanges } from "@/lib/portability/describe";
import { detectImportKind } from "@/lib/portability/detect-kind";
import { exportFilename, toCsv, toPlainList, type ExportKind } from "@/lib/portability/export-formats";
import { toExportRows } from "@/lib/portability/export-rows";

const LAST_BACKUP_KEY = "linkguard:lastBackupAt";
const NUDGE_AFTER_DAYS = 30;
const DAY_MS = 86_400_000;

// localStorage is only a convenience (the "last backup" reminder). It can be
// missing or blocked, so every access is wrapped and the page works without it.
function readLastBackupMs(): number | null {
  try {
    const raw = window.localStorage.getItem(LAST_BACKUP_KEY);
    const ms = raw ? Date.parse(raw) : Number.NaN;
    return Number.isNaN(ms) ? null : ms;
  } catch {
    return null;
  }
}

function writeLastBackup(iso: string) {
  try {
    window.localStorage.setItem(LAST_BACKUP_KEY, iso);
  } catch {
    // ignore: the reminder is optional
  }
}

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type Pending = { text: string; kind: ImportKind; summary: ImportSummary };

const BUTTON =
  "rounded border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400/60 disabled:cursor-not-allowed disabled:opacity-50";

export default function DataTransfer({
  backend,
  hasData,
  onImported,
}: {
  backend: DashboardBackend;
  hasData: boolean;
  onImported: () => Promise<void>;
}) {
  // undefined = not known yet, null = never exported, number = days since.
  const [backupDays, setBackupDays] = useState<number | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string[] | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  // State is set inside the callback, after mount (the lint rule allows this).
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const last = readLastBackupMs();
      setBackupDays(last === null ? null : Math.max(0, Math.floor((Date.now() - last) / DAY_MS)));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleExport(kind: ExportKind) {
    setError(null);
    setMessage(null);
    setPending(null);
    setBusy(true);
    const result = await backend.exportData();
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    const domains = result.data.domains;
    if (domains.length === 0) {
      setError("There is nothing to export yet. Add a domain first.");
      return;
    }

    const now = new Date();
    if (kind === "backup") {
      downloadText(exportFilename(kind, now), serializeBackup(createBackup(domains, now)), "application/json");
      writeLastBackup(now.toISOString());
      setBackupDays(0);
      setMessage(["Backup downloaded. Keep it somewhere safe; it contains your scan history."]);
    } else if (kind === "domains-list") {
      downloadText(exportFilename(kind, now), toPlainList(toExportRows(domains)), "text/plain");
      setMessage(["Domain list downloaded."]);
    } else {
      // The byte order mark helps Excel read the em dash in posture labels.
      downloadText(exportFilename(kind, now), "\uFEFF" + toCsv(toExportRows(domains)), "text/csv");
      setMessage(["CSV downloaded."]);
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    input.value = ""; // lets the same file be chosen again later
    if (!file) return;

    setError(null);
    setMessage(null);
    setPending(null);

    if (file.size > MAX_BACKUP_BYTES) {
      setError("That file is too large to import (limit 5 MB).");
      return;
    }

    setBusy(true);
    let text: string;
    try {
      text = await file.text();
    } catch {
      setBusy(false);
      setError("That file could not be read.");
      return;
    }

    const kind = detectImportKind(text);
    const preview = await backend.previewImport(text, kind);
    setBusy(false);

    if (!preview.ok) {
      setError(preview.error);
      return;
    }
    setPending({ text, kind, summary: preview.data.summary });
  }

  async function handleConfirm() {
    if (!pending) return;
    setBusy(true);
    const result = await backend.applyImport(pending.text, pending.kind);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPending(null);
    setMessage(describeImport(result.data.summary, "result"));
    await onImported();
  }

  const showNudge = hasData && backupDays !== undefined && (backupDays === null || backupDays >= NUDGE_AFTER_DAYS);

  return (
    <section aria-labelledby="transfer-heading" className="mt-10 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <h2 id="transfer-heading" className="text-lg font-semibold text-white">
        Backup and import
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        Your data lives only in this browser. Export a backup to keep it safe, move it to another
        device, or restore it if you clear this site&apos;s data. Files are read in your browser and
        are never uploaded.
      </p>

      {backupDays !== undefined && (
        <p className={`mt-3 text-sm ${showNudge ? "text-amber-300" : "text-slate-400"}`}>
          {backupDays === null
            ? "You have not exported a backup yet."
            : backupDays === 0
              ? "Last backup: today."
              : `Last backup: ${backupDays} day${backupDays === 1 ? "" : "s"} ago.`}
        </p>
      )}

      <h3 className="mt-5 text-sm font-semibold text-slate-200">Export</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className={BUTTON} disabled={busy} onClick={() => handleExport("backup")}>
          Backup (.json): restores everything
        </button>
        <button type="button" className={BUTTON} disabled={busy} onClick={() => handleExport("domains-list")}>
          Domain names (.txt): names only
        </button>
        <button type="button" className={BUTTON} disabled={busy} onClick={() => handleExport("domains-csv")}>
          Summary (.csv): status and dates, for spreadsheets
        </button>
      </div>

      <h3 className="mt-5 text-sm font-semibold text-slate-200">Import</h3>
      <p className="mt-1 text-xs text-slate-500">
        Accepts a LinkGuard backup, or a list of domains in a common format: plain text, hosts
        file, CSV with a &quot;domain&quot; column, JSON, or a list of URLs. You will see a preview before
        anything is saved, and existing domains and history are never overwritten.
      </p>
      <input
        type="file"
        accept=".json,.txt,.csv,.tsv,.list,.hosts,text/*,application/json"
        onChange={handleFile}
        disabled={busy}
        aria-label="Choose a file to import"
        className="mt-2 block w-full text-sm text-slate-300 file:mr-3 file:rounded file:border file:border-slate-600 file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:text-slate-200 hover:file:bg-slate-800"
      />

      {pending && (
        <div className="mt-4 rounded border border-cyan-500/40 p-3" role="region" aria-label="Import preview">
          <p className="text-sm font-semibold text-cyan-200">
            Preview ({pending.kind === "backup" ? "LinkGuard backup" : "domain list"})
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
            {describeImport(pending.summary, "preview").map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className={BUTTON}
              disabled={busy || !hasChanges(pending.summary)}
              onClick={handleConfirm}
            >
              Import
            </button>
            <button type="button" className={BUTTON} disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div role="status" aria-live="polite" className="mt-3 text-sm">
        {busy && <p className="text-slate-400">Working…</p>}
        {error && (
          <p role="alert" className="text-red-400">
            <span aria-hidden="true">✗ </span>
            {error}
          </p>
        )}
        {message && (
          <ul className="space-y-1 text-emerald-300">
            {message.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}