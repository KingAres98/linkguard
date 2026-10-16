import type { ImportKind } from "./apply-import";
import { BACKUP_FORMAT } from "./backup";

/**
 * Decides which importer should read a file. Anything carrying LinkGuard's
 * backup marker goes to the strict backup parser (which gives a clear error
 * if the file is damaged); everything else is treated as a domain list.
 */
export function detectImportKind(text: string): ImportKind {
  const trimmed = text.replace(/^\uFEFF/, "").trimStart();
  if (trimmed.startsWith("{") && trimmed.includes(BACKUP_FORMAT)) return "backup";
  return "list";
}