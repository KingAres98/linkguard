import { describe, expect, it } from "vitest";
import { postureStyleFor } from "./posture-style";

const FALLBACK = postureStyleFor("not a real label");

describe("postureStyleFor", () => {
  it.each([
    "Known Threat Listing",
    "Critical Issues Found",
    "Needs Attention",
    "Good Configuration Observed",
    "Good Configuration \u2014 Minor Notes",
  ])("gives %s its own style", (label) => {
    expect(postureStyleFor(label)).not.toEqual(FALLBACK);
  });

  it("treats the minor-notes label the same whichever dash is used", () => {
    expect(postureStyleFor("Good Configuration - Minor Notes")).toEqual(
      postureStyleFor("Good Configuration \u2014 Minor Notes"),
    );
  });

  it("never colours the best result green, so it cannot read as 'safe'", () => {
    const style = postureStyleFor("Good Configuration Observed");
    expect(JSON.stringify(style)).not.toMatch(/emerald|green|lime/);
  });

  it("falls back to a neutral style for unknown labels", () => {
    expect(postureStyleFor("Insufficient Data")).toEqual(FALLBACK);
    expect(postureStyleFor("")).toEqual(FALLBACK);
  });
});