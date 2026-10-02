import type { Finding } from "@/lib/scanner/types";
import StatusBadge from "./StatusBadge";

export default function FindingCard({
  finding,
  isPostureDriver = false,
}: {
  finding: Finding;
  isPostureDriver?: boolean;
}) {
  return (
    <article
      className={`rounded-lg border p-5 text-left ${
        isPostureDriver ? "border-amber-500/60 bg-amber-500/5" : "border-slate-800 bg-slate-900/50"
      }`}
    >
      <header className="flex flex-wrap items-center gap-3">
        <StatusBadge status={finding.status} />
        <h3 className="text-base font-semibold text-white">{finding.title}</h3>
        {isPostureDriver && (
          <span className="rounded border border-amber-500/50 px-2 py-0.5 text-xs font-medium text-amber-300">
            Drives overall posture
          </span>
        )}
        <span className="ml-auto text-xs uppercase tracking-wider text-slate-500">
          {finding.category} · severity: {finding.severity}
        </span>
      </header>

      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="font-medium text-slate-300">What we found</dt>
          <dd className="text-slate-400">{finding.description}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-300">Why it matters</dt>
          <dd className="text-slate-400">{finding.whyItMatters}</dd>
        </div>
        {finding.recommendation && (
          <div>
            <dt className="font-medium text-slate-300">Recommendation</dt>
            <dd className="text-slate-400">{finding.recommendation}</dd>
          </div>
        )}
        {finding.limitations && (
          <div>
            <dt className="font-medium text-slate-300">What we cannot conclude</dt>
            <dd className="text-slate-400">{finding.limitations}</dd>
          </div>
        )}
      </dl>

      {finding.evidence.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-cyan-400 hover:text-cyan-300">
            Evidence
          </summary>
          <ul className="mt-2 space-y-1 rounded bg-slate-950/70 p-3 font-mono text-xs">
            {finding.evidence.map((item) => (
              <li key={item.label} className="break-all text-slate-400">
                <span className="text-slate-500">{item.label}:</span> {item.value}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}