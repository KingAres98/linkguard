import type { ScanReport } from "@/lib/scanner/types";
import { sortFindings, groupByCategory } from "@/lib/scanner/sort";
import { summarizeFindings } from "@/lib/scanner/summary";
import CategorySection from "./CategorySection";

type PostureStyle = { frame: string; text: string };

// Visual weight only. The label text itself is always shown, so color is
// never the only signal. Even the best result is cyan, not green: this
// describes configuration, and a green block would read as "safe".
const POSTURE_STYLES: { test: (label: string) => boolean; style: PostureStyle }[] = [
  {
    test: (l) => l === "Known Threat Listing",
    style: { frame: "bg-threat/70", text: "text-threat" },
  },
  {
    test: (l) => l === "Critical Issues Found",
    style: { frame: "bg-red-400/60", text: "text-red-300" },
  },
  {
    test: (l) => l === "Needs Attention",
    style: { frame: "bg-signal/60", text: "text-signal" },
  },
  {
    test: (l) => l === "Good Configuration Observed",
    style: { frame: "bg-accent/60", text: "text-accent" },
  },
  {
    // "Good Configuration - Minor Notes" (any dash character)
    test: (l) => l.startsWith("Good Configuration"),
    style: { frame: "bg-sky-400/50", text: "text-sky-300" },
  },
];

const FALLBACK_POSTURE: PostureStyle = { frame: "bg-edge/70", text: "text-muted" };

function postureStyleFor(label: string): PostureStyle {
  return POSTURE_STYLES.find((entry) => entry.test(label))?.style ?? FALLBACK_POSTURE;
}

export default function ReportView({ report }: { report: ScanReport }) {
  const summary = summarizeFindings(report.findings);
  const findings = sortFindings(report.findings);
  const groups = groupByCategory(findings);
  const posture = postureStyleFor(report.posture.label);

  return (
    <section aria-labelledby="report-heading" className="w-full text-left">
      <p aria-hidden="true" className="font-mono text-xs tracking-[0.2em] text-accent">
        [ SCAN REPORT ]
      </p>
      <h2 id="report-heading" className="mt-1 font-display text-2xl font-bold text-white">
        LinkGuard Report
      </h2>
      <p className="mt-2 font-mono text-sm break-all text-accent">{report.target}</p>
      <p className="mt-1 font-mono text-xs text-muted">
        {new Date(report.scannedAt).toLocaleString()}
      </p>

      <div className={`lg-chamfer mt-5 p-px [--lg-cut:16px] ${posture.frame}`}>
        <div className="lg-chamfer bg-panel px-5 py-4 [--lg-cut:15px]">
          <p className="font-mono text-xs tracking-[0.15em] text-muted uppercase">
            Overall posture
          </p>
          <p className={`mt-1 font-display text-2xl font-bold ${posture.text}`}>
            {report.posture.label}
          </p>
        </div>
      </div>

      <div className="mt-4 border-l-2 border-edge bg-panel/60 px-4 py-3">
        <p aria-hidden="true" className="font-mono text-xs tracking-[0.15em] text-accent">
          // NOT A VERDICT
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          This posture describes the technical configuration LinkGuard
          observed. It is not a verdict on whether this site is safe to use {"\u2014"}
          read each finding&apos;s own explanation for what it does and does
          not show.
        </p>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="border border-line bg-panel px-3 py-2">
          <dt className="font-mono text-xs tracking-wider text-muted uppercase">Checks</dt>
          <dd className="font-display text-3xl font-bold text-white tabular-nums">
            {summary.total}
          </dd>
        </div>
        <div className="border border-red-400/30 bg-panel px-3 py-2">
          <dt className="font-mono text-xs tracking-wider text-red-300 uppercase">Failed</dt>
          <dd className="font-display text-3xl font-bold text-red-300 tabular-nums">
            {summary.fail}
          </dd>
        </div>
        <div className="border border-signal/30 bg-panel px-3 py-2">
          <dt className="font-mono text-xs tracking-wider text-signal uppercase">Warnings</dt>
          <dd className="font-display text-3xl font-bold text-signal tabular-nums">
            {summary.warning}
          </dd>
        </div>
        <div className="border border-emerald-400/30 bg-panel px-3 py-2">
          <dt className="font-mono text-xs tracking-wider text-emerald-300 uppercase">Passed</dt>
          <dd className="font-display text-3xl font-bold text-emerald-300 tabular-nums">
            {summary.pass}
          </dd>
        </div>
      </dl>

      <div className="mt-6 space-y-3">
        {groups.map((group, index) => (
          // Sections fade in one after another. The delay is capped so a long
          // report never feels slow, and reduced-motion switches it all off.
          <div
            key={group.category}
            className="lg-rise"
            style={{ animationDelay: `${Math.min(index, 6) * 70}ms` }}
          >
            <CategorySection group={group} postureDriverId={report.posture.drivenByFindingId} />
          </div>
        ))}
      </div>
    </section>
  );
}