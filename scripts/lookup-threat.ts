import {
  createSqliteThreatIndex,
  defaultThreatDbPath,
  openThreatDatabase,
} from "../src/lib/threat/sqlite-threat-index";

async function main() {
  const db = openThreatDatabase(defaultThreatDbPath());
  const index = createSqliteThreatIndex(db);
  const hostname = process.argv[2];

  console.log("Sources:", JSON.stringify(await index.getStatus(), null, 2));

  if (!hostname) {
    const sample = db
      .prepare("SELECT host FROM threat_hosts ORDER BY RANDOM() LIMIT 3")
      .all() as { host: string }[];
    console.log("Three sample listed hosts (do NOT open these in a browser):");
    for (const row of sample) console.log(`  ${row.host}`);
    console.log("Look one up with: npx tsx scripts/lookup-threat.ts <hostname>");
  } else {
    const matches = await index.lookup(hostname);
    console.log(`Matches for ${hostname}:`, JSON.stringify(matches, null, 2));
  }

  db.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});