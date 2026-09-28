import { describe, it, expect } from "vitest";
import { classifyIp } from "./ip-classify";

function blockedReason(ip: string): string | false {
  const result = classifyIp(ip);
  return result.blocked ? result.reason : false;
}

describe("classifyIp", () => {
  it.each([
    ["127.0.0.1", "loopback"],
    ["127.255.255.255", "loopback"],
    ["10.0.0.1", "private"],
    ["10.255.255.255", "private"],
    ["172.16.0.1", "private"],
    ["172.31.255.255", "private"],
    ["192.168.1.1", "private"],
    ["169.254.169.254", "cloud-metadata"],
    ["169.254.1.1", "link-local"],
    ["0.0.0.0", "unspecified"],
    ["100.64.0.1", "private"],
    ["224.0.0.1", "multicast"],
  ])("blocks IPv4 %s as %s", (ip, reason) => {
    expect(blockedReason(ip)).toBe(reason);
  });

  it.each([
    "172.15.255.255", // just below the 172.16.0.0/12 private range
    "172.32.0.0", // just above it
    "169.253.255.255", // just below the link-local range
  ])("allows IPv4 addresses just outside blocked ranges: %s", (ip) => {
    expect(blockedReason(ip)).toBe(false);
  });

  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34"])(
    "allows a normal public IPv4 address: %s",
    (ip) => {
      expect(blockedReason(ip)).toBe(false);
    },
  );

  it.each([
    ["::1", "loopback"],
    ["fe80::1", "link-local"],
    ["fc00::1", "private"],
    ["fd00::1", "private"],
    ["::", "unspecified"],
  ])("blocks IPv6 %s as %s", (ip, reason) => {
    expect(blockedReason(ip)).toBe(reason);
  });

  it("allows a normal public IPv6 address", () => {
    expect(blockedReason("2606:4700:4700::1111")).toBe(false);
  });

  it("unwraps an IPv4-mapped IPv6 address and classifies the inner address", () => {
    expect(blockedReason("::ffff:127.0.0.1")).toBe("loopback");
    expect(blockedReason("::ffff:8.8.8.8")).toBe(false);
  });

  it("blocks unparseable input rather than allowing it", () => {
    expect(blockedReason("not-an-ip")).toBeTruthy();
  });
});