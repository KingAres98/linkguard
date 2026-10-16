import { MAX_DOMAINS } from "@/lib/dashboard/parse-domain";
import type { ImportSummary } from "./apply-import";

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** True if applying this import would add anything at all. */
export function hasChanges(summary: ImportSummary): boolean {
  return summary.domainsAdded > 0 || summary.scansImported > 0;
}

/** Plain-language lines for the preview ("preview") or the finished import ("result"). */
export function describeImport(summary: ImportSummary, tense: "preview" | "result"): string[] {
  const preview = tense === "preview";
  const lines: string[] = [];

  if (!hasChanges(summary)) lines.push("Nothing new to import.");

  if (summary.domainsAdded > 0) {
    lines.push(`${preview ? "Will add" : "Added"} ${plural(summary.domainsAdded, "new domain")}.`);
  }
  if (summary.scansImported > 0) {
    lines.push(
      `${preview ? "Will import" : "Imported"} ${plural(summary.scansImported, "saved scan")} with their original dates.`,
    );
  }
  if (summary.domainsAlreadyTracked > 0) {
    lines.push(`${plural(summary.domainsAlreadyTracked, "domain")} already tracked here, left unchanged.`);
  }
  if (summary.scansSkipped > 0) {
    lines.push(
      `Left out: ${plural(summary.scansSkipped, "scan")} for domains that already have history here (existing history is never overwritten).`,
    );
  }
  if (summary.domainsOverLimit > 0) {
    lines.push(
      `Not added: ${plural(summary.domainsOverLimit, "domain")} (LinkGuard tracks at most ${MAX_DOMAINS} domains here).`,
    );
  }
  if (summary.linesSkipped > 0) {
    lines.push(
      `${plural(summary.linesSkipped, "line")} in the file had no usable domain name and ${preview ? "will be" : "were"} skipped.`,
    );
  }
  if (summary.truncated) {
    lines.push("The file contained a very large number of domains, so only the first 1000 were read.");
  }

  return lines;
}