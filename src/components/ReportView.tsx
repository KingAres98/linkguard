import type { ScanReport } from "@/lib/scanner/types";
import { sortFindings } from "@/lib/scanner/sort";
import { summarizeFindings } from "@/lib/scanner/summary";
import FindingCard from "./FindingCard";

export default function ReportView({ report }: { report: ScanReport }) {
  const summary = summarizeFindings(report.findings);
  const findings = sortFindings(report.findings);

  return (
    <section aria-labelledby="report-heading" className="w-full text-left">
      <p className="mb-4 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
        Sample data. This is not a real scan of the URL you entered.
      </p>

      <h2 id="report-heading" className="text-xl font-semibold text-white">
        LinkGuard Report
      </h2>
      <p className="mt-1 break-all font-mono text-sm text-cyan-300">{report.target}</p>
      <p className="mt-1 text-xs text-slate-500">
        {new Date(report.scannedAt).toLocaleString()}
      </p>

      <p className="mt-4 text-sm text-slate-300">
        {summary.total} checks performed · {summary.pass} passed · {summary.warning}{" "}
        warnings · {summary.fail} failed · {summary.unknown} unknown
      </p>

      <div className="mt-6 space-y-4">
        {findings.map((finding) => (
          <FindingCard key={finding.id} finding={finding} />
        ))}
      </div>
    </section>
  );
}