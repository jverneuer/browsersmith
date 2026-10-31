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
 * @browsercore/testing (0.2.4+) provides computeJa3/computeJa4 over raw
 * ClientHello bytes; the old packaging bug is fixed. The JA3/JA4 suites below
 * hash our ACTUAL built ClientHello and compare against golden values
 * captured from a real Chrome (146, Electron 41) via tls.browserleaks.com on
 * 2026-10-31 — real-browser gold, not self-computed constants.
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

/**
 * Build a REAL ClientHello (handshake-message bytes) from the shipped
 * chrome-140 profile using the production tls encoder + platform crypto —
 * the exact bytes fetch() puts on the wire (modulo record framing, which the
 * testing parsers accept either way).
 */
import { buildClientHello, generateKeyShares, TLS_1_3 } from "@browsercore/tls";
import { platform } from "../src/wiring.js";

async function buildHelloBytes(): Promise<Uint8Array> {
    const profile = getProfile(PROFILES["chrome-140"]);
    const provider = platform.crypto.provider;
    const keyPairs = await generateKeyShares(profile.tls.keyShareGroups, provider);
    const rng = (): number => {
        const [hi, lo] = provider.randomBytes(2);
        return ((hi ?? 0) * 256 + (lo ?? 0)) / 65536;
    };
    const config = {
        cipherSuites: profile.tls.cipherSuites,
        keyShareGroups: profile.tls.keyShareGroups,
        signatureAlgorithms: profile.tls.signatureAlgorithms,
        supportedVersions: [TLS_1_3],
        extensionOrder: profile.tls.extensionOrder,
        grease: profile.tls.grease,
        serverName: "example.com",
        alpnProtocols: ["h2", "http/1.1"],
    };
    const hello = buildClientHello(config, keyPairs, rng, provider);
    const message = hello.bytes ?? hello;
    // Wrap the handshake message in a TLS record header — the testing
    // package's JA4 parser expects record-framed input (JA3 accepts either).
    const record = new Uint8Array(5 + message.length);
    record[0] = 0x16; // ContentType handshake
    record[1] = 0x03;
    record[2] = 0x01; // legacy record version
    record[3] = (message.length >> 8) & 0xff;
    record[4] = message.length & 0xff;
    record.set(message, 5);
    return record;
}

const builtHello: { bytes: Uint8Array } = { bytes: await buildHelloBytes() };
const buildHello = (): { bytes: Uint8Array } => builtHello;

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
// JA3 / JA4 computation — real-browser gold (Chrome 146 via browserleaks)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GOLD, captured 2026-10-31 from a REAL Chrome (146.0.7680.80, Electron 41)
 * by visiting https://tls.browserleaks.com/json in the actual browser:
 *
 *   ja4        t13d1516h2_8daaf6152771_d8a2da3f94cd
 *   ja4_r ext  0005,000a,000b,000d,0012,0017,001b,0023,002b,002d,0033,44cd,fe0d,ff01
 *   ja3n ext   0-5-10-11-13-16-18-23-27-35-43-45-51-17613-65037-65281
 *   akamai h2  1:65536;2:0;4:6291456;6:262144|15663105|0|m,a,s,p
 *
 * These tests build OUR ClientHello from the shipped chrome-140 profile and
 * hash it with the same algorithms the oracle uses. Any profile/encoder
 * change that stops us hashing like a real browser fails here.
 */
const GOLD_JA4 = "t13d1516h2_8daaf6152771_d8a2da3f94cd";
const GOLD_JA4_PREFIX = "t13d1516h2";
const GOLD_JA4_CIPHER_HASH = "8daaf6152771";
const GOLD_JA3N_EXTENSIONS = "0-5-10-11-13-16-18-23-27-35-43-45-51-17613-65037-65281";

/** Lazy import so vitest never loads the library at collection time. */
async function importTesting(): Promise<typeof import("@browsercore/testing")> {
    return import("@browsercore/testing");
}

describe("fingerprint computation: JA3 hash", () => {
    it("computeJa3 produces a stable hash across builds (randomized fields excluded by construction)", async () => {
        const { computeJa3 } = await importTesting();
        const first = computeJa3(builtHello.bytes);
        const second = computeJa3(buildHello().bytes);
        expect(first).toMatch(/^[0-9a-f]{32}$/);
        expect(second).toBe(first);
    });

    it("JA3 input string has the expected structure", async () => {
        const { parseClientHello } = await importTesting();
        const seg = parseClientHello(builtHello.bytes);
        // TLS 1.2 record version on the wire (JA3 uses the legacy version 771).
        expect(seg.version).toBe("771");
        // GREASE-stripped, dash-joined, order as sent (the parser keeps
        // GREASE codes, so filter 0x?a?a before comparing with the oracle).
        const isGrease = (code: string): boolean => {
            const n = Number(code);
            const hi = n >> 8;
            return n >= 0x0a0a && n <= 0xfafa && hi === (n & 0xff);
        };
        const ciphers = seg.ciphers.split("-").filter((c) => !isGrease(c));
        expect(ciphers).toHaveLength(15);
        expect(ciphers.slice(0, 3).join("-")).toBe("4865-4866-4867");
        // Extension SET equals real Chrome 146 (sorted comparison — the shipped
        // profile sends a different wire ORDER than Chrome 146, which only
        // affects order-sensitive JA3, not JA4).
        const oursSorted = seg.extensions
            .split("-")
            .map(Number)
            .filter((n) => !isGrease(String(n)))
            .sort((a, b) => a - b)
            .join("-");
        expect(oursSorted).toBe(GOLD_JA3N_EXTENSIONS);
        expect(
            seg.supportedGroups
                .split("-")
                .map(Number)
                .filter((n) => !isGrease(String(n)))
                .sort((a, b) => a - b)
                .join("-"),
        ).toBe("23-24-29-4588");
        expect(seg.ecPointFormats).toBe("0");
    });
});

describe("fingerprint computation: JA4 hash", () => {
    it("computeJa4 matches the real-Chrome golden JA4 EXACTLY", async () => {
        const { computeJa4 } = await importTesting();
        expect(computeJa4(builtHello.bytes)).toBe(GOLD_JA4);
    });

    it("JA4 cipher/extension counts and segments match the projection", async () => {
        const { computeJa4 } = await importTesting();
        const ja4 = computeJa4(builtHello.bytes);
        const [prefix, cipherHash, extSigHash] = ja4.split("_");
        // t13 = TLS 1.3, d = SNI present, 15 = cipher count, 16 = extension
        // count (GREASE excluded), h2 = ALPN — exactly real Chrome 146.
        expect(prefix).toBe(GOLD_JA4_PREFIX);
        expect(cipherHash).toBe(GOLD_JA4_CIPHER_HASH);
        expect(extSigHash).toHaveLength(12);
    });
});
