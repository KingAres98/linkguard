import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

describe("package.json scripts", () => {
  it("defines the scripts that Vercel and CI rely on", () => {
    for (const name of ["build", "lint", "test", "typecheck", "vercel-build", "threat:update"]) {
      expect(pkg.scripts[name], `missing script: ${name}`).toBeTruthy();
    }
  });

  it("every 'npm run X' inside a script points at a script that exists", () => {
    for (const [name, command] of Object.entries(pkg.scripts)) {
      for (const match of command.matchAll(/npm run ([\w:-]+)/g)) {
        expect(pkg.scripts[match[1]], `"${name}" runs missing script "${match[1]}"`).toBeTruthy();
      }
    }
  });
});