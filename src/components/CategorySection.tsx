"use client";

import { useState } from "react";
import type { Finding } from "@/lib/scanner/types";
import { CATEGORY_LABELS } from "@/lib/scanner/category-meta";
import type { CategoryGroup } from "@/lib/scanner/sort";
import FindingCard from "./FindingCard";

function countsFor(findings: Finding[]) {
  return {
    fail: findings.filter((f) => f.status === "fail").length,
    warning: findings.filter((f) => f.status === "warning").length,
    pass: findings.filter((f) => f.status === "pass").length,
  };
}

export default function CategorySection({
  group,
  postureDriverId,
}: {
  group: CategoryGroup;
  postureDriverId?: string;
}) {
  // Start open if this category contains anything actionable, or the
  // posture driver, so the person sees what matters without extra clicks.
  const counts = countsFor(group.findings);
  const containsDriver = group.findings.some((f) => f.id === postureDriverId);
  const [open, setOpen] = useState(counts.fail > 0 || counts.warning > 0 || containsDriver);

  return (
    <section className="rounded-lg border border-slate-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="font-medium text-white">{CATEGORY_LABELS[group.category]}</span>
        <span className="flex items-center gap-3 text-xs">
          {counts.fail > 0 && <span className="text-red-400">{counts.fail} failed</span>}
          {counts.warning > 0 && <span className="text-amber-400">{counts.warning} warning</span>}
          {counts.pass > 0 && <span className="text-emerald-400">{counts.pass} passed</span>}
          <span aria-hidden="true" className="text-slate-500">
            {open ? "▲" : "▼"}
          </span>
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-slate-800 p-4">
          {group.findings.map((finding) => (
            <FindingCard key={finding.id} finding={finding} isPostureDriver={finding.id === postureDriverId} />
          ))}
        </div>
      )}
    </section>
  );
}