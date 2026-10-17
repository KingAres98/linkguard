"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import DataTransfer from "@/components/DataTransfer";
import ReportView from "@/components/ReportView";
import { postureStyleFor } from "@/components/posture-style";
import { createBrowserBackend } from "@/lib/dashboard/browser-backend";
import { createServerBackend, type DomainRow } from "@/lib/dashboard/backend";
import type { ApiResult } from "@/lib/dashboard/client";
import type { DashboardMode } from "@/lib/dashboard/mode";
import { createIndexedDbStore } from "@/lib/storage/indexeddb-store";
import type { StoredScan } from "@/lib/storage/types";

type History = { domainId: string; hostname: string; scans: StoredScan[] };

// Small bordered buttons. The focus ring comes from the global
// :focus-visible rule, so no per-button focus classes are needed.
const BUTTON_BASE =
  "border px-3 py-1.5 font-mono text-xs tracking-wider uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const BUTTON_ACCENT = `${BUTTON_BASE} border-accent/60 text-accent enabled:hover:bg-accent/10`;
const BUTTON_PLAIN = `${BUTTON_BASE} border-edge/60 text-ink enabled:hover:border-accent enabled:hover:text-accent`;
const BUTTON_DANGER = `${BUTTON_BASE} border-red-400/40 text-red-300 enabled:hover:bg-red-400/10`;

// The label is always shown; colour only helps scanning.
function PostureTag({ label }: { label: string }) {
  const style = postureStyleFor(label);
  return (
    <span
      className={`border px-2 py-0.5 font-mono text-xs font-semibold tracking-wider ${style.border} ${style.text}`}
    >
      {label}
    </span>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

export default function Dashboard({ mode }: { mode: Exclude<DashboardMode, "off"> }) {
  // Creating the browser store does not touch IndexedDB until first use,
  // so this is safe during server-side rendering.
  const backend = useMemo(
    () =>
      mode === "browser" ? createBrowserBackend(createIndexedDbStore()) : createServerBackend(),
    [mode],
  );

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
    applyDomainsResult(await backend.listDomains());
  }

  // First load. State is only set inside the .then callback, after the
  // data arrives. The cancelled flag stops a late response from updating
  // a page that has already gone away.
  useEffect(() => {
    let cancelled = false;
    void backend.listDomains().then((result) => {
      if (!cancelled) applyDomainsResult(result);
    });
    return () => {
      cancelled = true;
    };
  }, [backend, applyDomainsResult]);

  async function showHistory(domain: { id: string; hostname: string }) {
    const result = await backend.listScans(domain.id);
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
    const result = await backend.addDomain(trimmed);
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
    const result = await backend.scanDomain(domain);
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
    const result = await backend.removeDomain(domain.id);
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    if (history?.domainId === domain.id) setHistory(null);
    await refresh();
  }

  async function handleClearHistory(target: { id: string; hostname: string }) {
    if (!window.confirm(`Delete all saved scans for ${target.hostname}? The domain stays tracked.`)) {
      return;
    }
    setNotice(null);
    const result = await backend.clearScans(target.id);
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    await refresh();
    await showHistory(target);
  }

  // After an import the data changed underneath any open history view.
  async function handleImported() {
    setHistory(null);
    setOpenScanId(null);
    await refresh();
  }

  const busy = scanningId !== null;
  const openScan = history?.scans.find((s) => s.id === openScanId) ?? null;

  return (
    <div className="text-left">
      <p aria-hidden="true" className="font-mono text-xs tracking-[0.2em] text-accent">
        [ YOUR WATCHLIST ]
      </p>
      <header className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-3xl font-bold tracking-wide text-white">DASHBOARD</h1>
        <Link
          href="/"
          className="font-mono text-xs tracking-wider text-accent transition-colors hover:text-white"
        >
          {"\u2190 Scan a single URL"}
        </Link>
      </header>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        {mode === "browser"
          ? "Your tracked domains and scan history are stored in this browser only. Scanning sends the domain name to LinkGuard to run the checks; the results are saved here, not on the server. Clearing this site's data in your browser deletes them."
          : "Domains you track, with their latest scan. Everything here is stored on this machine."}
      </p>

      <form onSubmit={handleAdd} noValidate className="mt-8 max-w-2xl">
        <label
          htmlFor="domain-input"
          className="mb-2 block font-mono text-xs tracking-[0.15em] text-muted uppercase"
        >
          Add a domain
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          {/* Outer shape is the 1px frame; it lights up on focus, or turns red
              on an error, because clip-path would hide an ordinary outline. */}
          <div className="lg-chamfer flex-1 bg-edge p-px transition-colors focus-within:bg-accent has-[[aria-invalid=true]]:bg-red-400 [--lg-cut:12px]">
            <div className="lg-chamfer flex h-14 items-center gap-3 bg-panel px-4 [--lg-cut:11px]">
              <span aria-hidden="true" className="font-mono text-lg text-signal">
                &gt;
              </span>
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
                className="min-w-0 flex-1 bg-transparent font-mono text-base text-ink caret-signal placeholder:text-[#7b8fa4] focus:outline-none disabled:opacity-60"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={adding}
            className="lg-chamfer h-14 bg-signal px-9 font-display text-base font-bold tracking-[0.14em] text-ground uppercase transition-colors hover:bg-[#ffc56b] focus-visible:outline-ground focus-visible:outline-offset-[-5px] disabled:cursor-not-allowed disabled:opacity-60 [--lg-cut:12px]"
          >
            {adding ? "Adding\u2026" : "Add domain"}
          </button>
        </div>
        {formError && (
          <p id="domain-error" role="alert" className="mt-3 text-sm text-red-300">
            <span aria-hidden="true">{"\u2717 "}</span>
            {formError}
          </p>
        )}
      </form>

      <div role="status" aria-live="polite" className="mt-6 min-h-6 text-sm">
        {busy && (
          <p className="font-mono text-xs tracking-wider text-muted">
            {"Scanning\u2026 this can take several seconds."}
          </p>
        )}
        {notice && (
          <p role="alert" className="text-red-300">
            <span aria-hidden="true">{"\u2717 "}</span>
            {notice}
          </p>
        )}
      </div>
      {busy && (
        <div aria-hidden="true" className="mt-1 h-0.5 w-full max-w-2xl overflow-hidden bg-line">
          <div className="lg-scan-bar h-full w-1/3 bg-accent" />
        </div>
      )}

      <section aria-labelledby="domains-heading" className="mt-6">
        <h2 id="domains-heading" className="mb-3 font-display text-xl font-semibold text-white">
          Tracked domains
        </h2>

        {loadError && (
          <p role="alert" className="text-sm text-red-300">
            <span aria-hidden="true">{"\u2717 "}</span>
            {loadError}
          </p>
        )}
        {!loadError && domains === null && (
          <p className="text-sm text-muted">{"Loading\u2026"}</p>
        )}
        {domains !== null && domains.length === 0 && (
          <p className="text-sm text-muted">No domains yet. Add one above to get started.</p>
        )}

        {domains !== null && domains.length > 0 && (
          <ul className="space-y-3">
            {domains.map((domain) => (
              <li
                key={domain.id}
                className={`border border-l-[3px] border-line bg-panel p-4 ${
                  domain.latest ? postureStyleFor(domain.latest.postureLabel).edge : "border-l-edge"
                }`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono break-all text-white">{domain.hostname}</span>
                  {domain.latest ? (
                    <PostureTag label={domain.latest.postureLabel} />
                  ) : (
                    <span className="font-mono text-xs tracking-wider text-muted">
                      Not scanned yet
                    </span>
                  )}
                </div>
                {domain.latest && (
                  <p className="mt-2 font-mono text-xs text-muted">
                    Last scanned {formatTime(domain.latest.scannedAt)}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleScan(domain)}
                    disabled={busy}
                    aria-label={`Scan ${domain.hostname}`}
                    className={BUTTON_ACCENT}
                  >
                    {scanningId === domain.id ? "Scanning\u2026" : "Scan"}
                  </button>
                  <button
                    type="button"
                    onClick={() => showHistory(domain)}
                    aria-label={`View history for ${domain.hostname}`}
                    className={BUTTON_PLAIN}
                  >
                    History
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(domain)}
                    disabled={busy}
                    aria-label={`Remove ${domain.hostname}`}
                    className={`ml-auto ${BUTTON_DANGER}`}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {mode === "browser" && (
        <DataTransfer
          backend={backend}
          hasData={domains !== null && domains.length > 0}
          onImported={handleImported}
        />
      )}

      {history && (
        <section aria-labelledby="history-heading" className="mt-10">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 id="history-heading" className="font-display text-xl font-semibold text-white">
              History for <span className="font-mono break-all">{history.hostname}</span>
            </h2>
            {history.scans.length > 0 && (
              <button
                type="button"
                onClick={() => handleClearHistory({ id: history.domainId, hostname: history.hostname })}
                className={BUTTON_DANGER}
              >
                Clear history
              </button>
            )}
          </div>

          {history.scans.length === 0 ? (
            <p className="text-sm text-muted">No scans saved yet. Click Scan above.</p>
          ) : (
            <ul className="space-y-2">
              {history.scans.map((scan) => (
                <li key={scan.id}>
                  <button
                    type="button"
                    onClick={() => setOpenScanId(scan.id === openScanId ? null : scan.id)}
                    aria-expanded={scan.id === openScanId}
                    className="flex w-full flex-wrap items-center justify-between gap-2 border border-line bg-panel/60 px-4 py-3 text-left transition-colors hover:bg-accent/5 aria-expanded:border-accent/50 focus-visible:outline-offset-[-2px]"
                  >
                    <span className="font-mono text-xs tracking-wider text-ink">
                      {formatTime(scan.scannedAt)}
                    </span>
                    <PostureTag label={scan.postureLabel} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {openScan && (
            <div className="lg-rise mt-8">
              <ReportView report={openScan.report} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}