"use client";

import { useState, type FormEvent } from "react";

// A discriminated union: each phase carries only the data that makes sense
// for it. TypeScript won't let us read `message` while in the "loading" phase.
type FormState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "done"; submitted: string };

const MAX_URL_LENGTH = 2048;

export default function ScanForm() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<FormState>({ phase: "idle" });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = url.trim();

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

    // Placeholder: simulates a scan. Replaced by a real API call later.
    setTimeout(() => {
      setState({ phase: "done", submitted: trimmed });
    }, 1200);
  }

  const isLoading = state.phase === "loading";
  const hasError = state.phase === "error";

  return (
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

      {/* Error: role="alert" makes screen readers announce it immediately. */}
      {state.phase === "error" && (
        <p id="url-error" role="alert" className="mt-3 text-left text-sm text-red-400">
          <span aria-hidden="true">✗ </span>
          {state.message}
        </p>
      )}

      {/* Loading and results: role="status" is announced politely. */}
      <div role="status" aria-live="polite" className="mt-6 text-left text-sm">
        {isLoading && <p className="text-slate-400">Running checks…</p>}
        {state.phase === "done" && (
          <p className="text-slate-300">
            Scan pipeline not connected yet. You entered:{" "}
            <code className="break-all text-cyan-300">{state.submitted}</code>
          </p>
        )}
      </div>
    </form>
  );
}