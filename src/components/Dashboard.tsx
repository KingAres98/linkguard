"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import ReportView from "@/components/ReportView";
import { requestJson, type ApiResult } from "@/lib/dashboard/client";
import type { StoredScan, TrackedDomain } from "@/lib/storage/types";

type DomainRow = TrackedDomain & {
  latest: { scannedAt: string; postureLabel: string } | null;
};

type History = { domainId: string; hostname: string; scans: StoredScan[] };

// A full scan runs several network checks, so it gets longer than the default.
const SCAN_TIMEOUT_MS = 45000;

// Keyed by the label text. Unknown labels fall back to a neutral style.
const POSTURE_CLASSES: Record<string, string> = {
  "Critical Issues Found": "border-red-500/50 text-red-300",
  "Needs Attention": "border-amber-500/50 text-amber-300",
  "Good Configuration — Minor Notes": "border-cyan-500/50 text-cyan-300",
  "Good Configuration Observed": "border-emerald-500/50 text-emerald-300",
  "Insufficient Data": "border-slate-500/50 text-slate-300",
};

function PostureTag({ label }: { label: string }) {
  const classes = POSTURE_CLASSES[label] ?? "border-slate-500/50 text-slate-300";
  return (
    <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${classes}`}>{label}</span>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

export default function Dashboard() {
  const [domains, setDomains] = useState<DomainRow[] | null>(null); // null = still loading
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hostname, setHostname] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [openScanId, setOpenScanId] = useState<string | null>(null);

    // Turns a list-domains response into screen state. Shared by the first
  // load (below) and by refresh() after every change.
  const applyDomainsResult = useCallback((result: ApiResult<{ domains: DomainRow[] }>) => {
    if (result.ok) {
      setDomains(result.data.domains);
      setLoadError(null);
    } else {
      setLoadError(result.error);
    }
  }, []);

  async function refresh() {
    applyDomainsResult(await requestJson<{ domains: DomainRow[] }>("/api/domains"));
  }

  // First load. State is only set inside the .then callback, after the
  // response arrives. The cancelled flag stops a late response from
  // updating a page that has already gone away.
  useEffect(() => {
    let cancelled = false;
    void requestJson<{ domains: DomainRow[] }>("/api/domains").then((result) => {
      if (!cancelled) applyDomainsResult(result);
    });
    return () => {
      cancelled = true;
    };
  }, [applyDomainsResult]);

  async function showHistory(domain: DomainRow) {
    const result = await requestJson<{ scans: StoredScan[] }>(
      `/api/domains/${encodeURIComponent(domain.id)}/scans`,
    );
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    setHistory({ domainId: domain.id, hostname: domain.hostname, scans: result.data.scans });
    setOpenScanId(result.data.scans[0]?.id ?? null);
  }

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = hostname.trim();
    if (trimmed.length === 0) {
      setFormError("Enter a domain to track.");
      return;
    }

    setAdding(true);
    setFormError(null);
    const result = await requestJson<{ domain: TrackedDomain }>("/api/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hostname: trimmed }),
    });
    setAdding(false);

    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setHostname("");
    await refresh();
  }

  async function handleScan(domain: DomainRow) {
    setScanningId(domain.id);
    setNotice(null);
    const result = await requestJson<{ scan: StoredScan }>(
      `/api/domains/${encodeURIComponent(domain.id)}/scan`,
      { method: "POST" },
      SCAN_TIMEOUT_MS,
    );
    setScanningId(null);

    if (!result.ok) {
      setNotice(`Scan of ${domain.hostname} failed: ${result.error}`);
      return;
    }
    await refresh();
    if (history?.domainId === domain.id) await showHistory(domain);
  }

  async function handleRemove(domain: DomainRow) {
    if (!window.confirm(`Remove ${domain.hostname} and all of its saved scans?`)) return;

    setNotice(null);
    const result = await requestJson<{ ok: boolean }>(
      `/api/domains/${encodeURIComponent(domain.id)}`,
      { method: "DELETE" },
    );
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    if (history?.domainId === domain.id) setHistory(null);
    await refresh();
  }
    async function handleClearHistory(target: History) {
    if (!window.confirm(`Delete all saved scans for ${target.hostname}? The domain stays tracked.`)) {
      return;
    }

    setNotice(null);
    const result = await requestJson<{ ok: boolean; removed: number }>(
      `/api/domains/${encodeURIComponent(target.domainId)}/scans`,
      { method: "DELETE" },
    );
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    setHistory({ ...target, scans: [] });
    setOpenScanId(null);
    await refresh();
  }

  const busy = scanningId !== null;
  const openScan = history?.scans.find((s) => s.id === openScanId) ?? null;

  return (
    <div className="text-left">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-widest text-white">DASHBOARD</h1>
        <Link href="/" className="text-sm text-cyan-400 hover:text-cyan-300">
          ← Scan a single URL
        </Link>
      </header>
      <p className="mt-2 text-sm text-slate-400">
        Domains you track, with their latest scan. Everything here is stored on this machine.
      </p>

      <form onSubmit={handleAdd} noValidate className="mt-8">
        <label htmlFor="domain-input" className="mb-2 block text-sm font-medium text-slate-300">
          Add a domain
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="domain-input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="example.com"
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            disabled={adding}
            aria-invalid={formError !== null}
            aria-describedby={formError ? "domain-error" : undefined}
            className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={adding}
            className="rounded-md bg-cyan-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {adding ? "Adding…" : "Add domain"}
          </button>
        </div>
        {formError && (
          <p id="domain-error" role="alert" className="mt-3 text-sm text-red-400">
            <span aria-hidden="true">✗ </span>
            {formError}
          </p>
        )}
      </form>

      <div role="status" aria-live="polite" className="mt-6 min-h-6 text-sm">
        {busy && <p className="text-slate-400">Scanning… this can take several seconds.</p>}
        {notice && (
          <p role="alert" className="text-red-400">
            <span aria-hidden="true">✗ </span>
            {notice}
          </p>
        )}
      </div>

      <section aria-labelledby="domains-heading" className="mt-4">
        <h2 id="domains-heading" className="mb-3 text-lg font-semibold text-white">
          Tracked domains
        </h2>

        {loadError && (
          <p role="alert" className="text-sm text-red-400">
            <span aria-hidden="true">✗ </span>
            {loadError}
          </p>
        )}
        {!loadError && domains === null && <p className="text-sm text-slate-400">Loading…</p>}
        {domains !== null && domains.length === 0 && (
          <p className="text-sm text-slate-400">No domains yet. Add one above to get started.</p>
        )}

        {domains !== null && domains.length > 0 && (
          <ul className="space-y-3">
            {domains.map((domain) => (
              <li
                key={domain.id}
                className="rounded-lg border border-slate-800 bg-slate-900/50 p-4"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="break-all font-mono text-white">{domain.hostname}</span>
                  {domain.latest ? (
                    <PostureTag label={domain.latest.postureLabel} />
                  ) : (
                    <span className="text-xs text-slate-500">Not scanned yet</span>
                  )}
                </div>
                {domain.latest && (
                  <p className="mt-2 text-xs text-slate-500">
                    Last scanned {formatTime(domain.latest.scannedAt)}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => handleScan(domain)}
                    disabled={busy}
                    aria-label={`Scan ${domain.hostname}`}
                    className="rounded border border-cyan-500/60 px-3 py-1.5 text-cyan-300 hover:bg-cyan-500/10 focus:outline-none focus:ring-2 focus:ring-cyan-400/60 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {scanningId === domain.id ? "Scanning…" : "Scan"}
                  </button>
                  <button
                    type="button"
                    onClick={() => showHistory(domain)}
                    aria-label={`View history for ${domain.hostname}`}
                    className="rounded border border-slate-600 px-3 py-1.5 text-slate-300 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
                  >
                    History
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(domain)}
                    disabled={busy}
                    aria-label={`Remove ${domain.hostname}`}
                    className="ml-auto rounded border border-red-500/40 px-3 py-1.5 text-red-300 hover:bg-red-500/10 focus:outline-none focus:ring-2 focus:ring-red-400/60 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {history && (
        <section aria-labelledby="history-heading" className="mt-10">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 id="history-heading" className="text-lg font-semibold text-white">
              History for <span className="break-all font-mono">{history.hostname}</span>
            </h2>
            {history.scans.length > 0 && (
              <button
                type="button"
                onClick={() => handleClearHistory(history)}
                disabled={busy}
                className="rounded border border-red-500/40 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/10 focus:outline-none focus:ring-2 focus:ring-red-400/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear history
              </button>
            )}
          </div>
          <p className="mb-4 text-xs text-slate-500">
            LinkGuard keeps the newest 20 scans for each domain and deletes older ones automatically.
          </p>

          {history.scans.length === 0 ? (
            <p className="text-sm text-slate-400">No scans saved yet. Click Scan above.</p>
          ) : (
            <ul className="space-y-2">
              {history.scans.map((scan) => (
                <li key={scan.id}>
                  <button
                    type="button"
                    onClick={() => setOpenScanId(scan.id === openScanId ? null : scan.id)}
                    aria-expanded={scan.id === openScanId}
                    className="flex w-full flex-wrap items-center justify-between gap-2 rounded border border-slate-800 px-4 py-3 text-left hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
                  >
                    <span className="text-sm text-slate-300">{formatTime(scan.scannedAt)}</span>
                    <PostureTag label={scan.postureLabel} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {openScan && (
            <div className="mt-8">
              <ReportView report={openScan.report} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}