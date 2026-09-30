import { describe, it, expect, beforeAll, afterAll } from "vitest";
import tls from "node:tls";
import forge from "node-forge";
import type { AddressInfo } from "node:net";
import { inspectCertificate } from "./tls-inspect";

/** Generates a minimal self-signed cert for the given hostname and validity window. */
function generateCert(hostname: string, daysValidFrom: number, daysValidTo: number) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() + daysValidFrom * 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + daysValidTo * 86_400_000);
  const attrs = [{ name: "commonName", value: hostname }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([{ name: "subjectAltName", altNames: [{ type: 2, value: hostname }] }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  return {
    key: forge.pki.privateKeyToPem(keys.privateKey),
    cert: forge.pki.certificateToPem(cert),
  };
}

function startTlsServer(hostname: string, daysValidFrom: number, daysValidTo: number) {
  const { key, cert } = generateCert(hostname, daysValidFrom, daysValidTo);
  return tls.createServer({ key, cert }, (socket) => socket.end());
}

describe("inspectCertificate", () => {
  describe("a currently valid certificate", () => {
    let server: tls.Server;
    let port: number;

    beforeAll(async () => {
      server = startTlsServer("localhost", -1, 365);
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      port = (server.address() as AddressInfo).port;
    });
    afterAll(() => server.close());

    it("reports it as not expired, not-yet-valid, and hostname-matching", async () => {
      const result = await inspectCertificate("localhost", "127.0.0.1", port);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.certificate.isExpired).toBe(false);
      expect(result.certificate.isNotYetValid).toBe(false);
      expect(result.certificate.hostnameMatches).toBe(true);
      expect(result.certificate.daysUntilExpiry).toBeGreaterThan(300);
    });
  });

  describe("an expired certificate", () => {
    let server: tls.Server;
    let port: number;

    beforeAll(async () => {
      server = startTlsServer("localhost", -30, -1);
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      port = (server.address() as AddressInfo).port;
    });
    afterAll(() => server.close());

    it("reports it as expired", async () => {
      const result = await inspectCertificate("localhost", "127.0.0.1", port);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.certificate.isExpired).toBe(true);
      expect(result.certificate.daysUntilExpiry).toBeLessThan(0);
    });
  });

  describe("a certificate for a different hostname", () => {
    let server: tls.Server;
    let port: number;

    beforeAll(async () => {
      server = startTlsServer("wrong-name.example", -1, 365);
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      port = (server.address() as AddressInfo).port;
    });
    afterAll(() => server.close());

    it("reports the hostname as not matching", async () => {
      const result = await inspectCertificate("localhost", "127.0.0.1", port);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.certificate.hostnameMatches).toBe(false);
    });
  });

  it("returns handshake-failed when the target is not a TLS server at all", async () => {
    const net = await import("node:net");
    const plainServer = net.createServer((socket) => socket.end());
    await new Promise<void>((resolve) => plainServer.listen(0, "127.0.0.1", resolve));
    const port = (plainServer.address() as AddressInfo).port;

    const result = await inspectCertificate("localhost", "127.0.0.1", port, 2000);
    expect(result.ok).toBe(false);

    plainServer.close();
  });
});