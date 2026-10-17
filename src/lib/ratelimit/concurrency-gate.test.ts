import { describe, expect, it } from "vitest";
import { ConcurrencyGate } from "./concurrency-gate";

describe("ConcurrencyGate", () => {
  it("refuses entry once the limit is reached", () => {
    const gate = new ConcurrencyGate(2);
    expect(gate.tryEnter()).not.toBeNull();
    expect(gate.tryEnter()).not.toBeNull();
    expect(gate.tryEnter()).toBeNull();
  });

  it("frees a slot when released", () => {
    const gate = new ConcurrencyGate(1);
    const release = gate.tryEnter();
    expect(gate.tryEnter()).toBeNull();
    release?.();
    expect(gate.tryEnter()).not.toBeNull();
  });

  it("ignores a second release of the same slot", () => {
    const gate = new ConcurrencyGate(1);
    const release = gate.tryEnter();
    release?.();
    release?.();
    expect(gate.inFlight).toBe(0);
    gate.tryEnter();
    expect(gate.inFlight).toBe(1);
  });
});