import { describe, expect, it } from "vitest";
import { getProfile } from "../src/index.js";
import type { ProfileId } from "../src/types.js";
import {
    buildExpectedClientHello,
    validateProfileAgainstCapture,
} from "../src/validate.js";
import type { TlsCapture } from "../src/validate.js";

describe("buildExpectedClientHello", () => {
    it("projects chrome-140 cipher suites and extensions to known wire codes", () => {
        const profile = getProfile("chrome-140" as ProfileId);
        const expected = buildExpectedClientHello(profile, "example.com");

        // GREASE placeholder → canonical first GREASE code 0x0a0a.
        expect(expected.cipherSuites[0]).toBe(0x0a0a);
        // TLS 1.3 suites per IANA registry.
        expect(expected.cipherSuites[1]).toBe(0x1301); // TLS_AES_128_GCM_SHA256
        expect(expected.cipherSuites[2]).toBe(0x1302); // TLS_AES_256_GCM_SHA384
        expect(expected.cipherSuites[3]).toBe(0x1303); // TLS_CHACHA20_POLY1305_SHA256

        // Extension type codes from the IANA TLS ExtensionType registry.
        expect(expected.extensionTypes).toContain(0); // SNI
        expect(expected.extensionTypes).toContain(43); // supported_versions
        expect(expected.extensionTypes).toContain(51); // key_share
        expect(expected.extensionTypes).toContain(13); // signature_algorithms
        expect(expected.extensionTypes).toContain(16); // ALPN
        expect(expected.extensionTypes).toContain(10); // supported_groups

        // Named groups.
        expect(expected.keyShareGroups).toContain(0x001d); // x25519
        expect(expected.keyShareGroups).toContain(0x0017); // secp256r1

        // Signature schemes (first entry: ecdsa_secp256r1_sha256).
        expect(expected.signatureAlgorithms[0]).toBe(0x0403);

        // Supported versions: TLS 1.3 then TLS 1.2.
        expect(expected.supportedVersions[0]).toBe(0x0304);
        expect(expected.supportedVersions[1]).toBe(0x0303);

        expect(expected.grease).toBe(true);
        expect(expected.sni).toBe("example.com");
    });
});

describe("validateProfileAgainstCapture", () => {
    it("reports ok for a matching fake capture", () => {
        const profile = getProfile("chrome-140" as ProfileId);
        const expected = buildExpectedClientHello(profile, "example.com");

        const capture: TlsCapture = {
            cipherSuites: expected.cipherSuites,
            extensionTypes: expected.extensionTypes,
            supportedVersions: expected.supportedVersions,
            keyShareGroups: expected.keyShareGroups,
            signatureAlgorithms: expected.signatureAlgorithms,
            grease: true,
        };

        const result = validateProfileAgainstCapture(profile, capture);

        expect(result.ok).toBe(true);
        expect(result.diffs).toEqual([]);
    });

    it("accepts a different GREASE-pattern value in a GREASE cipher slot", () => {
        const profile = getProfile("chrome-140" as ProfileId);
        const expected = buildExpectedClientHello(profile, "example.com");

        // Replace the canonical GREASE code with another valid GREASE value.
        const ciphers = [...expected.cipherSuites];
        ciphers[0] = 0x1a1a;

        const capture: TlsCapture = {
            cipherSuites: ciphers,
            extensionTypes: expected.extensionTypes,
            supportedVersions: expected.supportedVersions,
            keyShareGroups: expected.keyShareGroups,
            signatureAlgorithms: expected.signatureAlgorithms,
            grease: true,
        };

        const result = validateProfileAgainstCapture(profile, capture);

        expect(result.ok).toBe(true);
        expect(result.diffs).toEqual([]);
    });

    it("reports not ok with diffs for a mismatched capture", () => {
        const profile = getProfile("chrome-140" as ProfileId);
        const expected = buildExpectedClientHello(profile, "example.com");

        const capture: TlsCapture = {
            // First real cipher suite flipped to a wrong value.
            cipherSuites: [expected.cipherSuites[0], 0xdead, ...expected.cipherSuites.slice(2)],
            extensionTypes: expected.extensionTypes,
            supportedVersions: expected.supportedVersions,
            keyShareGroups: expected.keyShareGroups,
            signatureAlgorithms: expected.signatureAlgorithms,
            // GREASE flag also flipped.
            grease: false,
        };

        const result = validateProfileAgainstCapture(profile, capture);

        expect(result.ok).toBe(false);
        expect(result.diffs.some((d) => d.path === "tls.grease")).toBe(true);
        expect(result.diffs.some((d) => d.path === "tls.cipherSuites[1]")).toBe(true);
    });
});
