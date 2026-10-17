import type { Status } from "@/lib/scanner/types";

// Record<Status, ...> forces an entry for every status. Add a new status
// to types.ts and forget it here, and the compiler complains.
// Green is used only here, for one check passing. It is never used for the
// overall posture, because a big green block would read as "safe".
const STYLES: Record<Status, { symbol: string; label: string; classes: string }> = {
  pass: {
    symbol: "\u2713",
    label: "PASS",
    classes: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  },
  warning: {
    symbol: "\u26A0",
    label: "WARNING",
    classes: "border-signal/50 bg-signal/10 text-signal",
  },
  fail: {
    symbol: "\u2717",
    label: "FAIL",
    classes: "border-red-400/50 bg-red-400/10 text-red-300",
  },
  info: {
    symbol: "i",
    label: "INFO",
    classes: "border-edge/60 bg-edge/10 text-muted",
  },
  unknown: {
    symbol: "?",
    label: "UNKNOWN",
    classes: "border-edge/60 bg-edge/10 text-muted",
  },
};

export default function StatusBadge({ status }: { status: Status }) {
  const { symbol, label, classes } = STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-xs font-semibold tracking-wider ${classes}`}
    >
      {/* Symbol is decorative; the text label carries the meaning. */}
      <span aria-hidden="true">{symbol}</span>
      {label}
    </span>
  );
}