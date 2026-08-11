/**
 * Fingerprint computation smoke test: profile → ClientHello wire projection.
 *
 * This suite bridges the gap between profile DATA (what browsersmith exposes)
 * and fingerprint COMPUTATION (what a detector sees). It uses
 * `buildExpectedClientHello` from @browsercore/profiles — the single projection
 * seam that maps a profile's human-readable fields onto the IANA wire codes a
 * ClientHello carries — to verify the projected structure a JA3/JA4 hash would
 * consume.
 *
 * Why not @browsercore/testing here? The published @browsercore/testing has a
 * packaging bug (its index eagerly imports a captures manifest the npm tarball
 * omits, crashing on import — see tests/golden-fingerprint.test.ts for the
 * same note). Once a fixed version ships, the skipped JA3/JA4 tests below
 * should be activated to compute the actual hash and compare against the
 * known chrome-140 golden values.
 *
 * What this suite proves today: the chrome-140 profile projects onto a
 * well-formed set of wire codes with the correct counts and ordering that a
 * real Chrome ClientHello carries. This is the data-level foundation of JA3/JA4.
 */

import { describe, it, expect } from "vitest";
import {
    getProfile,
    buildExpectedClientHello,
    cipherSuiteToWire,
    CIPHER_GREASE_PLACEHOLDER,
    NAMED_GROUP_CODES,
    SIGNATURE_SCHEME_CODES,
    VERSION_CODES,
    type ClientHelloExpected,
} from "@browsercore/profiles";
import { PROFILES } from "../src/profiles.js";

/** The chrome-140 profile projected onto the wire values its ClientHello carries. */
const expected: ClientHelloExpected = buildExpectedClientHello(
    getProfile(PROFILES["chrome-140"]),
    "example.com",
);

// ─────────────────────────────────────────────────────────────────────────────
// Wire projection integrity — every profile name resolves to an IANA code
// ─────────────────────────────────────────────────────────────────────────────

describe("fingerprint computation: profile → wire projection", () => {
    it("resolves all cipher-suite names to 2-byte IANA codes", () => {
        // Every cipher in the profile must project cleanly. An unknown name
        // would throw from cipherSuiteToWire — this asserts none do.
        for (const name of getProfile(PROFILES["chrome-140"]).tls.cipherSuites) {
            const code = cipherSuiteToWire(name);
            expect(typeof code).toBe("number");
            expect(code).toBeGreaterThanOrEqual(0);
            expect(code).toBeLessThanOrEqual(0xffff);
        }
    });

    it("resolves the GREASE cipher placeholder to a GREASE-pattern code", () => {
        const greaseCode = cipherSuiteToWire(CIPHER_GREASE_PLACEHOLDER);
        // GREASE values have the shape 0x?a?a (high byte === low byte).
        expect((greaseCode >> 8) & 0xff).toBe(greaseCode & 0xff);
        expect(greaseCode).toBeGreaterThanOrEqual(0x0a0a);
    });

    it("projects key-share group names to their IANA named-group codes", () => {
        expect(expected.keyShareGroups).toContain(NAMED_GROUP_CODES.X25519MLKEM768);
        expect(expected.keyShareGroups).toContain(NAMED_GROUP_CODES.x25519);
        expect(expected.keyShareGroups).toContain(NAMED_GROUP_CODES.secp256r1);
        expect(expected.keyShareGroups).toContain(NAMED_GROUP_CODES.secp384r1);
    });

    it("places the post-quantum group code (0x11ec) first in the key-share list", () => {
        expect(expected.keyShareGroups[0]).toBe(0x11ec);
    });

    it("projects signature algorithms to their IANA codes", () => {
        expect(expected.signatureAlgorithms[0])
            .toBe(SIGNATURE_SCHEME_CODES.ecdsa_secp256r1_sha256);
        expect(expected.signatureAlgorithms)
            .toContain(SIGNATURE_SCHEME_CODES.rsa_pss_rsae_sha256);
    });

    it("projects supported versions to their IANA codes", () => {
        expect(expected.supportedVersions[0]).toBe(VERSION_CODES["TLS 1.3"]);
        expect(expected.supportedVersions).toContain(VERSION_CODES["TLS 1.2"]);
    });

    it("carries the SNI hostname derived from the connection target", () => {
        expect(expected.sni).toBe("example.com");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Structural assertions — the counts and ordering a JA3/JA4 hash consumes
// ─────────────────────────────────────────────────────────────────────────────

describe("fingerprint computation: ClientHello structural counts", () => {
    it("advertises exactly 16 cipher suites (1 GREASE + 15 real)", () => {
        // Chrome 140 ships 1 GREASE slot + 15 cipher suites.
        expect(expected.cipherSuites).toHaveLength(16);
    });

    it("leads cipher codes with a GREASE-pattern value (0x?a?a)", () => {
        const first = expected.cipherSuites[0];
        expect(first).toBeDefined();
        expect((first >> 8) & 0xff).toBe(first & 0xff);
        expect(first).toBeGreaterThanOrEqual(0x0a0a);
    });

    it("advertises the three TLS 1.3 cipher codes immediately after GREASE", () => {
        expect(expected.cipherSuites[1]).toBe(0x1301); // TLS_AES_128_GCM_SHA256
        expect(expected.cipherSuites[2]).toBe(0x1302); // TLS_AES_256_GCM_SHA384
        expect(expected.cipherSuites[3]).toBe(0x1303); // TLS_CHACHA20_POLY1305_SHA256
    });

    it("advertises at least 15 TLS extensions", () => {
        // Chrome's ClientHello carries a rich extension set (server_name,
        // supported_versions, key_share, encrypted_client_hello, etc.).
        expect(expected.extensionTypes.length).toBeGreaterThanOrEqual(15);
    });

    it("includes the encrypted_client_hello extension (code 65037)", () => {
        // ECH (0xFE0D = 65037) is a defining feature of modern Chrome.
        expect(expected.extensionTypes).toContain(65037);
    });

    it("includes key_share (51) and supported_versions (43) extensions", () => {
        expect(expected.extensionTypes).toContain(51);
        expect(expected.extensionTypes).toContain(43);
    });

    it("offers 4 key-share groups (1 PQ hybrid + 3 classical)", () => {
        expect(expected.keyShareGroups).toHaveLength(4);
    });

    it("offers 8 signature algorithms", () => {
        expect(expected.signatureAlgorithms).toHaveLength(8);
    });

    it("marks GREASE as enabled in the projected ClientHello", () => {
        expect(expected.grease).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// JA3 / JA4 computation — depends on @browsercore/testing (not yet importable)
// ─────────────────────────────────────────────────────────────────────────────

describe("fingerprint computation: JA3 hash", () => {
    it.skip("TODO(dep-bump-testing): computeJa3 produces a stable chrome-140 hash", () => {
        // @browsercore/testing exports computeJa3(clientHelloBytes) → string.
        // The published version has a packaging bug that crashes on import.
        // Once a fixed @browsercore/testing ships, build a ClientHello from
        // the chrome-140 profile, pass the bytes to computeJa3, and assert the
        // hash matches the known golden chrome-140 JA3.
        //
        // Expected flow:
        //   const { computeJa3 } = await import("@browsercore/testing");
        //   const ja3 = computeJa3(clientHelloBytes);
        //   expect(ja3).toMatch(/^[0-9a-f]{32}$/);
    });

    it.skip("TODO(dep-bump-testing): JA3 input string has the expected structure", () => {
        // JA3 = MD5(sslVersion,ciphers,extensions,groups,ec_point_formats)
        // Once @browsercore/testing is importable, verify the pre-hash input
        // string is the comma-joined decimal codes for version, ciphers,
        // extensions, and groups — with GREASE values stripped per RFC 8701.
    });
});

describe("fingerprint computation: JA4 hash", () => {
    it.skip("TODO(dep-bump-testing): computeJa4 produces a stable chrome-140 hash", () => {
        // @browsercore/testing exports computeJa4(clientHelloBytes) → string.
        // JA4 format: q•version•alpn•ciphers_count•extensions_count•
        //             sha256(extensions_sorted)_sha256(signature_algorithms)
        // The published version has a packaging bug that crashes on import.
        // Once fixed, verify the JA4 string starts with "t13d" (TLS 1.3,
        // no SNI gap, definite-length) and has the expected field counts.
    });

    it.skip("TODO(dep-bump-testing): JA4 cipher/extension counts match projection", () => {
        // The JA4 prefix encodes counts: the cipher count and extension count
        // segments should match the projected ClientHello (after GREASE
        // removal). Once @browsercore/testing is importable, parse the JA4
        // prefix and assert the counts align with expected.cipherSuites and
        // expected.extensionTypes lengths.
    });
});
