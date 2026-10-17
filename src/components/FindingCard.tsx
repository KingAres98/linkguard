import type { Finding, Status } from "@/lib/scanner/types";
import StatusBadge from "./StatusBadge";

// The colored left edge repeats the status. The badge text is what carries
// the meaning, so this is a visual aid for scanning, not the only signal.
const EDGE: Record<Status, string> = {
  pass: "border-l-emerald-400/60",
  warning: "border-l-signal",
  fail: "border-l-red-400",
  info: "border-l-edge",
  unknown: "border-l-edge",
};

const LABEL = "font-mono text-xs tracking-wider text-accent/80 uppercase";

export default function FindingCard({
  finding,
  isPostureDriver = false,
}: {
  finding: Finding;
  isPostureDriver?: boolean;
}) {
  return (
    <article
      className={`border border-l-[3px] p-5 text-left ${
        isPostureDriver
          ? "border-signal/40 border-l-signal bg-signal/5"
          : `border-line bg-panel ${EDGE[finding.status]}`
      }`}
    >
      <header className="flex flex-wrap items-center gap-3">
        <StatusBadge status={finding.status} />
        <h3 className="font-display text-base font-semibold text-white">{finding.title}</h3>
        {isPostureDriver && (
          <span className="border border-signal/50 px-2 py-0.5 font-mono text-xs tracking-wider text-signal">
            Drives overall posture
          </span>
        )}
        <span className="ml-auto font-mono text-xs tracking-wider text-muted uppercase">
          {finding.category} {"\u00B7"} severity: {finding.severity}
        </span>
      </header>

      <dl className="mt-5 space-y-4 text-sm">
        <div>
          <dt className={LABEL}>What we found</dt>
          <dd className="mt-1 leading-relaxed text-ink/90">{finding.description}</dd>
        </div>
        <div>
          <dt className={LABEL}>Why it matters</dt>
          <dd className="mt-1 leading-relaxed text-muted">{finding.whyItMatters}</dd>
        </div>
        {finding.recommendation && (
          <div>
            <dt className={LABEL}>Recommendation</dt>
            <dd className="mt-1 leading-relaxed text-muted">{finding.recommendation}</dd>
          </div>
        )}
        {finding.limitations && (
          <div>
            <dt className={LABEL}>What we cannot conclude</dt>
            <dd className="mt-1 leading-relaxed text-muted">{finding.limitations}</dd>
          </div>
        )}
      </dl>

      {finding.evidence.length > 0 && (
        <details className="mt-5 text-sm">
          <summary className="w-fit cursor-pointer font-mono text-xs tracking-wider text-accent uppercase hover:text-white">
            Evidence
          </summary>
          <ul className="mt-2 space-y-1 border border-line bg-ground p-3 font-mono text-xs">
            {finding.evidence.map((item) => (
              <li key={item.label} className="break-all text-muted">
                <span className="text-edge">{item.label}:</span>{" "}
                <span className="text-ink/90">{item.value}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}