"use client";

import { useState, type FormEvent } from "react";
import ReportView from "@/components/ReportView";
import { MAX_URL_LENGTH } from "@/lib/scanner/validate-input";
import type { ScanReport } from "@/lib/scanner/types";

type FormState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "done"; report: ScanReport };

const REQUEST_TIMEOUT_MS = 15000;

export default function ScanForm() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<FormState>({ phase: "idle" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = url.trim();

    // Convenience checks only. The server re-validates everything.
    if (trimmed.length === 0) {
      setState({ phase: "error", message: "Enter a URL to scan." });
      return;
    }
    if (trimmed.length > MAX_URL_LENGTH) {
      setState({
        phase: "error",
        message: `That URL is too long (maximum ${MAX_URL_LENGTH} characters).`,
      });
      return;
    }

    setState({ phase: "loading" });

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const data = (await response.json().catch(() => null)) as {
        report?: ScanReport;
        error?: string;
      } | null;

      if (!response.ok || !data?.report) {
        setState({
          phase: "error",
          message: data?.error ?? "The scan failed. Please try again.",
        });
        return;
      }

      setState({ phase: "done", report: data.report });
    } catch {
      setState({
        phase: "error",
        message: "The scan service did not respond. Check your connection and try again.",
      });
    }
  }

  const isLoading = state.phase === "loading";
  const hasError = state.phase === "error";

  return (
    <div className="flex w-full flex-col items-center">
      <form onSubmit={handleSubmit} noValidate className="w-full max-w-xl">
        <label
          htmlFor="url-input"
          className="mb-2 block text-left text-sm font-medium text-slate-300"
        >
          Website URL
        </label>

        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="url-input"
            name="url"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isLoading}
            aria-invalid={hasError}
            aria-describedby={hasError ? "url-error" : undefined}
            className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-md bg-cyan-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Scanning…" : "Scan URL"}
          </button>
        </div>

        {state.phase === "error" && (
          <p id="url-error" role="alert" className="mt-3 text-left text-sm text-red-400">
            <span aria-hidden="true">✗ </span>
            {state.message}
          </p>
        )}

        <div role="status" aria-live="polite" className="mt-6 text-left text-sm">
          {isLoading && <p className="text-slate-400">Running checks…</p>}
          {state.phase === "done" && (
                <p className="text-slate-300">Scan complete. Report shown below.</p>
          )}
        </div>
      </form>

      {state.phase === "done" && (
        <div className="mt-10 w-full max-w-3xl">
          <ReportView report={state.report} />
        </div>
      )}
    </div>
  );
}