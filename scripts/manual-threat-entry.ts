import {
  createSqliteThreatIndex,
  defaultThreatDbPath,
  openThreatDatabase,
} from "../src/lib/threat/sqlite-threat-index";

// A separate source, so the real feed data is never touched.
const SOURCE = "manual-test";

async function main() {
  const [command, host] = process.argv.slice(2);
  const db = openThreatDatabase(defaultThreatDbPath());

  if (command === "add" && host) {
    await createSqliteThreatIndex(db).replaceSource(
      SOURCE,
      [host.toLowerCase()],
      new Date().toISOString(),
    );
    console.log(`Added ${host} under the "${SOURCE}" source.`);
  } else if (command === "remove") {
    db.prepare("DELETE FROM threat_hosts WHERE source = ?").run(SOURCE);
    db.prepare("DELETE FROM threat_sources WHERE source = ?").run(SOURCE);
    console.log(`Removed the "${SOURCE}" entries.`);
  } else {
    console.log("Usage:");
    console.log("  npx tsx scripts/manual-threat-entry.ts add <hostname>");
    console.log("  npx tsx scripts/manual-threat-entry.ts remove");
    process.exitCode = 1;
  }

  db.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});