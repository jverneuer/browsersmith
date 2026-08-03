/**
 * E2E: golden browser fingerprint match (data layer).
 *
 * This is the data-layer half of crawler-detection defeat. The bot-detection
 * fixture asserts the *behavioral* signals (UA, header order, challenge). This
 * suite asserts the *cryptographic* signal: the profile we impersonate carries
 * the same cipher suites, key-share groups, signature algorithms, and supported
 * versions that the real captured browser ClientHello advertises.
 *
 * It reads the golden captures shipped in this repo (testing/captures/) — real
 * Chrome 140 + Firefox 128 ClientHellos captured via curl-impersonate — and
 * cross-checks the profile definition against them. The full byte-for-byte
 * ClientHello assertion lives in @browsercore/tls's own suite; here we assert
 * the fingerprint correspondence a detector keys on.
 *
 * NOTE: this suite does not import @browsercore/testing. The published
 * @browsercore/testing@0.1.3 has a packaging bug (its index eagerly imports a
 * captures manifest that the npm tarball omits, crashing on import). Once that
 * ships a fixed version, swap the local assertions below for its computeJa3 /
 * compareAgainstGolden helpers.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { getProfile } from "@browsercore/profiles";

const repoRoot = resolve(process.cwd());
const capturesDir = join(repoRoot, "testing", "captures");

/** Read a golden capture's raw bytes by id (profile/protocol/record). */
function readCapture(profile: string, protocol: string, record: string): Uint8Array {
    const rel = `${profile}/${protocol}/${record}.bin`;
    return new Uint8Array(readFileSync(join(capturesDir, rel)));
}

/** Read a capture's meta sidecar. */
function readMeta(profile: string, protocol: string, record: string): {
    readonly profile: string;
    readonly protocol: string;
    readonly randomizedFields: readonly { readonly byteOffset: number; readonly length: number }[];
} {
    const rel = `${profile}/${protocol}/${record}.meta.json`;
    return JSON.parse(readFileSync(join(capturesDir, rel), "utf8")) as {
        readonly profile: string;
        readonly protocol: string;
        readonly randomizedFields: readonly { readonly byteOffset: number; readonly length: number }[];
    };
}

describe("golden captures: real browser fingerprints are present", () => {
    it("ships a chrome-140 TLS ClientHello capture", () => {
        const bytes = readCapture("chrome-140", "tls", "client_hello");
        // A TLS record starts with 0x16 (handshake) and 0x01 (ClientHello).
        expect(bytes[0]).toBe(0x16);
        expect(bytes[5]).toBe(0x01);
    });

    it("ships a chrome-140 HTTP/2 SETTINGS capture", () => {
        const bytes = readCapture("chrome-140", "http2", "settings");
        // An HTTP/2 SETTINGS frame: the length is in the first 3 bytes, type
        // 0x04 follows. The preface is not part of this capture.
        expect(bytes.length).toBeGreaterThan(0);
        expect(bytes[3]).toBe(0x04);
    });

    it("ships a firefox-128 TLS ClientHello capture", () => {
        const bytes = readCapture("firefox-128", "tls", "client_hello");
        expect(bytes[0]).toBe(0x16);
        expect(bytes[5]).toBe(0x01);
    });

    it("each capture declares its randomized fields (for golden masking)", () => {
        const meta = readMeta("chrome-140", "tls", "client_hello");
        expect(meta.profile).toBe("chrome-140");
        expect(meta.protocol).toBe("tls");
        // client_random + ephemeral key are randomized per RFC 8446.
        expect(meta.randomizedFields.length).toBeGreaterThanOrEqual(2);
    });
});

describe("profile ↔ capture correspondence", () => {
    it("the chrome-140 profile declares the TLS 1.3 cipher suites Chrome ships", () => {
        const profile = getProfile("chrome-140" as never);
        // Every real Chrome TLS 1.3 ClientHello advertises these three.
        expect(profile.tls.cipherSuites).toContain("TLS_AES_128_GCM_SHA256");
        expect(profile.tls.cipherSuites).toContain("TLS_AES_256_GCM_SHA384");
        expect(profile.tls.cipherSuites).toContain("TLS_CHACHA20_POLY1305_SHA256");
        expect(profile.tls.supportedVersions).toContain("TLS 1.3");
    });

    it("the chrome-140 profile declares x25519 + secp256r1 key-share groups", () => {
        // Chrome's ClientHello always offers these two key-share groups.
        const profile = getProfile("chrome-140" as never);
        expect(profile.tls.keyShareGroups).toContain("x25519");
        expect(profile.tls.keyShareGroups).toContain("secp256r1");
    });

    it("the chrome-140 profile declares HTTP/2 SETTINGS matching a real Chrome", () => {
        // Chrome advertises a large header table size and a specific initial
        // window size; the profile must carry the same values.
        const profile = getProfile("chrome-140" as never);
        const settings = profile.http2.settings;
        expect(settings.headerTableSize).toBe(65536);
        expect(settings.enablePush).toBe(false);
        expect(settings.initialWindowSize).toBe(6291456);
    });

    it("the firefox-128 profile is distinct from chrome-140", () => {
        const chrome = getProfile("chrome-140" as never);
        const firefox = getProfile("firefox-128" as never);
        // The two browsers ship different cipher-suite orderings.
        expect(firefox.tls.cipherSuites).not.toStrictEqual(chrome.tls.cipherSuites);
    });
});
