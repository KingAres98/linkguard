import { describe, it, expect, beforeAll, afterAll } from "vitest";
import tls from "node:tls";
import forge from "node-forge";
import type { AddressInfo } from "node:net";
import { checkTls } from "./tls-checker";

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
  return { key: forge.pki.privateKeyToPem(keys.privateKey), cert: forge.pki.certificateToPem(cert) };
}

describe("checkTls", () => {
  it("produces a pass finding with a limitations note for a valid certificate", async () => {
    const { key, cert } = generateCert("localhost", -1, 365);
    const server = tls.createServer({ key, cert }, (s) => s.end());
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;

    const findings = await checkTls("localhost", "127.0.0.1", port);
    const validity = findings.find((f) => f.id === "tls.certificate.valid");
    expect(validity?.status).toBe("pass");
    expect(validity?.limitations).toBeTruthy();

    server.close();
  });

  it("produces a fail finding for an expired certificate", async () => {
    const { key, cert } = generateCert("localhost", -30, -1);
    const server = tls.createServer({ key, cert }, (s) => s.end());
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;

    const findings = await checkTls("localhost", "127.0.0.1", port);
    const expired = findings.find((f) => f.id === "tls.certificate.expired");
    expect(expired?.status).toBe("fail");
    expect(expired?.severity).toBe("high");

    server.close();
  });

  it("produces an unknown-status finding when there is no TLS server", async () => {
    const findings = await checkTls("localhost", "127.0.0.1", 1);
    expect(findings.every((f) => f.status === "unknown")).toBe(true);
  });
});