import type { Status } from "@/lib/scanner/types";

// Record<Status, ...> forces an entry for every status. Add a new status
// to types.ts and forget it here, and the compiler complains.
const STYLES: Record<Status, { symbol: string; label: string; classes: string }> = {
  pass: { symbol: "✓", label: "PASS", classes: "border-emerald-500/50 text-emerald-300" },
  warning: { symbol: "⚠", label: "WARNING", classes: "border-amber-500/50 text-amber-300" },
  fail: { symbol: "✗", label: "FAIL", classes: "border-red-500/50 text-red-300" },
  info: { symbol: "i", label: "INFO", classes: "border-slate-500/50 text-slate-300" },
  unknown: { symbol: "?", label: "UNKNOWN", classes: "border-slate-500/50 text-slate-300" },
};

export default function StatusBadge({ status }: { status: Status }) {
  const { symbol, label, classes } = STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-xs font-semibold tracking-wider ${classes}`}
    >
      {/* Symbol is decorative; the text label carries the meaning. */}
      <span aria-hidden="true">{symbol}</span>
      {label}
    </span>
  );
}