import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { downloadText } from "../src/lib/threat/download";
import { refreshSource, resolveSource, THREAT_SOURCES } from "../src/lib/threat/refresh";
import { describeError, redactSecrets } from "../src/lib/threat/safe-error";
import {
  createSqliteThreatIndex,
  defaultThreatDbPath,
  openThreatDatabase,
} from "../src/lib/threat/sqlite-threat-index";

// Private download URLs live in .env.local. Next.js reads that file, but a
// plain script doesn't, so load it here. On a hosting platform there is no
// such file; the values come from its environment settings instead.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: feeds that need a private URL are simply skipped.
}

const MAX_BYTES = 100 * 1024 * 1024;
const TIMEOUT_MS = 120_000;

// When "true", a feed that cannot even be attempted (for example because its
// private URL is not set) counts as a failure. Hosting builds use this so a
// missing setting stops the deploy instead of quietly weakening protection.
const REQUIRE_ALL = process.env.THREAT_REQUIRE_ALL_SOURCES === "true";

async function main() {
  const dbPath = defaultThreatDbPath();
  // On a fresh checkout (such as a hosting build) the data folder is absent.
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = openThreatDatabase(dbPath);
  const index = createSqliteThreatIndex(db);
  let failed = false;

  for (const definition of THREAT_SOURCES) {
    const source = resolveSource(definition, process.env);
    if (!source) {
      const hint = definition.urlEnvVar
        ? `set ${definition.urlEnvVar} (an https:// link) in .env.local, or in your host's environment settings, to enable it`
        : "no valid download URL";
      if (REQUIRE_ALL) {
        failed = true;
        console.error(`Missing required feed ${definition.name}: ${hint}.`);
      } else {
        console.log(`Skipping ${definition.name}: ${hint}.`);
      }
      continue;
    }

    console.log(`Updating ${source.name}...`);
    const result = await refreshSource(index, source, (url) =>
      downloadText(url, { maxBytes: MAX_BYTES, timeoutMs: TIMEOUT_MS }),
    );
    if (result.ok) {
      console.log(`  OK: ${result.count} entries (${result.skipped} lines skipped).`);
    } else {
      failed = true;
      console.error(`  FAILED: ${redactSecrets(String(result.error))}`);
    }
  }

  // Seal the database into one self-contained file: fold any pending write-ahead
  // data into it, then leave WAL mode. A read-only host cannot create the side
  // files WAL mode needs, so a sealed file is the one it can open.
  db.pragma("wal_checkpoint(TRUNCATE)");
  db.pragma("journal_mode = DELETE");

  db.close();
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(describeError(error));
  process.exitCode = 1;
});