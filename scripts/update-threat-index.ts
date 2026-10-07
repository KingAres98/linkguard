import { downloadText } from "../src/lib/threat/download";
import { refreshSource, THREAT_SOURCES } from "../src/lib/threat/refresh";
import {
  createSqliteThreatIndex,
  defaultThreatDbPath,
  openThreatDatabase,
} from "../src/lib/threat/sqlite-threat-index";

const MAX_BYTES = 100 * 1024 * 1024;
const TIMEOUT_MS = 120_000;

async function main() {
  const db = openThreatDatabase(defaultThreatDbPath());
  const index = createSqliteThreatIndex(db);
  let failed = false;

  for (const source of THREAT_SOURCES) {
    console.log(`Updating ${source.name}...`);
    const result = await refreshSource(index, source, (url) =>
      downloadText(url, { maxBytes: MAX_BYTES, timeoutMs: TIMEOUT_MS }),
    );
    if (result.ok) {
      console.log(`  OK: ${result.count} entries (${result.skipped} lines skipped).`);
    } else {
      failed = true;
      console.error(`  FAILED: ${result.error}`);
    }
  }

  db.close();
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});