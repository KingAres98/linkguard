import type { ScanReport } from "@/lib/scanner/types";
import { sortFindings, groupByCategory } from "@/lib/scanner/sort";
import { summarizeFindings } from "@/lib/scanner/summary";
import CategorySection from "./CategorySection";

// Visual weight only, chosen to be legible without relying on color alone:
// the label text itself is always shown alongside these.
const POSTURE_STYLES: Record<string, string> = {
  "Known Threat Listing": "border-rose-500/60 bg-rose-500/15 text-rose-200",
  "Critical Issues Found": "border-red-500/50 bg-red-500/10 text-red-300",
  "Needs Attention": "border-amber-500/50 bg-amber-500/10 text-amber-300",
  "Good Configuration — Minor Notes": "border-sky-500/50 bg-sky-500/10 text-sky-300",
  "Good Configuration Observed": "border-emerald-500/50 bg-emerald-500/10 text-emerald-300",
  "Insufficient Data": "border-slate-500/50 bg-slate-500/10 text-slate-300",
};

export default function ReportView({ report }: { report: ScanReport }) {
  const summary = summarizeFindings(report.findings);
  const findings = sortFindings(report.findings);
  const groups = groupByCategory(findings);
  const postureStyle = POSTURE_STYLES[report.posture.label] ?? POSTURE_STYLES["Insufficient Data"];

  return (
    <section aria-labelledby="report-heading" className="w-full text-left">
      <h2 id="report-heading" className="text-xl font-semibold text-white">
        LinkGuard Report
      </h2>
      <p className="mt-1 break-all font-mono text-sm text-cyan-300">{report.target}</p>
      <p className="mt-1 text-xs text-slate-500">
        {new Date(report.scannedAt).toLocaleString()}
      </p>

      <div className={`mt-4 rounded-lg border px-4 py-3 ${postureStyle}`}>
        <p className="text-xs uppercase tracking-wider opacity-80">Overall posture</p>
        <p className="mt-1 text-lg font-semibold">{report.posture.label}</p>
      </div>

      <p className="mt-4 rounded border border-slate-600 bg-slate-800/50 px-3 py-2 text-sm text-slate-300">
        This posture describes the technical configuration LinkGuard
        observed. It is not a verdict on whether this site is safe to use —
        read each finding&apos;s own explanation for what it does and does
        not show.
      </p>

            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded border border-slate-800 px-3 py-2">
          <dt className="text-xs uppercase tracking-wide text-slate-500">Checks</dt>
          <dd className="text-lg font-semibold text-white">{summary.total}</dd>
        </div>
        <div className="rounded border border-red-500/30 px-3 py-2">
          <dt className="text-xs uppercase tracking-wide text-red-400">Failed</dt>
          <dd className="text-lg font-semibold text-red-300">{summary.fail}</dd>
        </div>
        <div className="rounded border border-amber-500/30 px-3 py-2">
          <dt className="text-xs uppercase tracking-wide text-amber-400">Warnings</dt>
          <dd className="text-lg font-semibold text-amber-300">{summary.warning}</dd>
        </div>
        <div className="rounded border border-emerald-500/30 px-3 py-2">
          <dt className="text-xs uppercase tracking-wide text-emerald-400">Passed</dt>
          <dd className="text-lg font-semibold text-emerald-300">{summary.pass}</dd>
        </div>
      </dl>

      <div className="mt-6 space-y-3">
        {groups.map((group) => (
          <CategorySection
            key={group.category}
            group={group}
            postureDriverId={report.posture.drivenByFindingId}
          />
        ))}
      </div>
    </section>
  );
}