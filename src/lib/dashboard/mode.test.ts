import { afterEach, describe, expect, it, vi } from "vitest";
import { guardDashboardRequest } from "./guard";
import { getDashboardMode } from "./mode";

afterEach(() => {
  vi.unstubAllEnvs();
});

function setEnv(enabled: string, mode: string) {
  vi.stubEnv("LINKGUARD_DASHBOARD_ENABLED", enabled);
  vi.stubEnv("LINKGUARD_DASHBOARD_MODE", mode);
}

describe("getDashboardMode", () => {
  it("is off by default", () => {
    setEnv("", "");
    expect(getDashboardMode()).toBe("off");
  });

  it("treats the older ENABLED=true flag as server mode", () => {
    setEnv("true", "");
    expect(getDashboardMode()).toBe("server");
  });

  it("MODE=browser wins over the older flag", () => {
    setEnv("true", "browser");
    expect(getDashboardMode()).toBe("browser");
  });

  it("MODE=server turns on server mode", () => {
    setEnv("", "server");
    expect(getDashboardMode()).toBe("server");
  });

  it("MODE=off wins over the older flag", () => {
    setEnv("true", "off");
    expect(getDashboardMode()).toBe("off");
  });

  it("ignores unknown mode values", () => {
    setEnv("", "bogus");
    expect(getDashboardMode()).toBe("off");
  });
});

describe("guardDashboardRequest and modes", () => {
  const request = () => new Request("http://localhost/api/domains");

  it("refuses with 404 in browser mode", () => {
    setEnv("", "browser");
    expect(guardDashboardRequest(request())?.status).toBe(404);
  });

  it("allows the request in server mode", () => {
    setEnv("", "server");
    expect(guardDashboardRequest(request())).toBeNull();
  });
});