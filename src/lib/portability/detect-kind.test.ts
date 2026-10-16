import { describe, expect, it } from "vitest";
import { detectImportKind } from "./detect-kind";

describe("detectImportKind", () => {
  it("recognizes a LinkGuard backup", () => {
    expect(detectImportKind('{ "format": "linkguard-backup", "version": 1 }')).toBe("backup");
  });

  it("sends a damaged backup to the backup parser so the error is clear", () => {
    expect(detectImportKind('{ "format": "linkguard-backup", "vers')).toBe("backup");
  });

  it("treats plain lists as lists", () => {
    expect(detectImportKind("example.com\nexample.org\n")).toBe("list");
  });

  it("treats generic JSON domain lists as lists", () => {
    expect(detectImportKind('{"domains":["a.com"]}')).toBe("list");
  });
});