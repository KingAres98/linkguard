/** Caps how many scans run at once. tryEnter() returns a release function, or null if full. */
export class ConcurrencyGate {
  private active = 0;

  constructor(private readonly max: number) {}

  get inFlight(): number {
    return this.active;
  }

  tryEnter(): (() => void) | null {
    if (this.active >= this.max) return null;
    this.active++;
    let released = false;
    return () => {
      if (released) return; // releasing twice must not free someone else's slot
      released = true;
      this.active--;
    };
  }
}