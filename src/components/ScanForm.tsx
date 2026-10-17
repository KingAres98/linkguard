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
    <div className="flex w-full flex-col">
      <form onSubmit={handleSubmit} noValidate className="w-full max-w-2xl">
        <label
          htmlFor="url-input"
          className="mb-2 block font-mono text-xs tracking-[0.15em] text-muted uppercase"
        >
          Website URL
        </label>

        <div className="flex flex-col gap-3 sm:flex-row">
          {/* Outer shape is the 1px frame. It lights up on focus, or turns red
              on an error, because clip-path would hide an ordinary outline. */}
          <div className="lg-chamfer flex-1 bg-edge p-px transition-colors focus-within:bg-accent has-[[aria-invalid=true]]:bg-red-400 [--lg-cut:12px]">
            <div className="lg-chamfer flex h-14 items-center gap-3 bg-panel px-4 [--lg-cut:11px]">
              <span aria-hidden="true" className="font-mono text-lg text-signal">
                &gt;
              </span>
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
                className="min-w-0 flex-1 bg-transparent font-mono text-base text-ink caret-signal placeholder:text-[#7b8fa4] focus:outline-none disabled:opacity-60"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="lg-chamfer h-14 bg-signal px-9 font-display text-base font-bold tracking-[0.14em] text-ground uppercase transition-colors hover:bg-[#ffc56b] focus-visible:outline-ground focus-visible:outline-offset-[-5px] disabled:cursor-not-allowed disabled:opacity-60 [--lg-cut:12px]"
          >
            {isLoading ? "Scanning\u2026" : "Scan"}
          </button>
        </div>

        {isLoading && (
          <div aria-hidden="true" className="mt-3 h-0.5 w-full overflow-hidden bg-line">
            <div className="lg-scan-bar h-full w-1/3 bg-accent" />
          </div>
        )}

        {state.phase === "error" && (
          <p id="url-error" role="alert" className="mt-3 text-sm text-red-300">
            <span aria-hidden="true">{"\u2717 "}</span>
            {state.message}
          </p>
        )}

        <div
          role="status"
          aria-live="polite"
          className="mt-4 min-h-5 font-mono text-xs tracking-wider text-muted"
        >
          {isLoading && <p>Running checks{"\u2026"}</p>}
          {state.phase === "done" && <p>Scan complete. Report shown below.</p>}
        </div>
      </form>

      {state.phase === "done" && (
        <div className="lg-rise mt-10 w-full max-w-3xl">
          <ReportView report={state.report} />
        </div>
      )}
    </div>
  );
}