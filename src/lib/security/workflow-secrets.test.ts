import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(process.cwd(), ".github", "workflows");
const files = readdirSync(dir).filter((name) => /\.ya?ml$/.test(name));

describe("GitHub workflows: secrets", () => {
  it("finds the workflow files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s contains no deploy-hook URL", (name) => {
    const text = readFileSync(join(dir, name), "utf8");
    expect(text).not.toMatch(/api\.vercel\.com\/v1\/integrations\/deploy/);
  });

  it("the nightly job reads the hook from a secret", () => {
    const text = readFileSync(join(dir, "nightly-refresh.yml"), "utf8");
    expect(text).toContain("secrets.VERCEL_DEPLOY_HOOK_URL");
  });
});