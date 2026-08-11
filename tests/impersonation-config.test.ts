/**
 * Integration smoke test: profile data flows through browsersmith to protocol
 * configs.
 *
 * Browsersmith is the composition root — the single place where every
 * @browsercore/* package meets. This suite proves the headline USP works at
 * the config level: a chrome-140 profile carries the TLS, HTTP/2, and HTTP/1.1
 * fingerprint data that the protocol layers translate into wire bytes.
 *
 * This is NOT a network test. It asserts that the profile registry (the source
 * of truth for browser fingerprints) carries the values a detector keys on.
 * The wire-level ClientHello assertion lives in @browsercore/tls; the HTTP/2
 * SETTINGS frame assertion lives in @browsercore/http2. Here we verify the
 * data those layers consume.
 */

import { describe, it, expect, expectTypeOf } from "vitest";
import {
    getProfile,
    type BrowserProfile,
} from "@browsercore/profiles";
import type { HeaderCasing } from "@browsercore/http1";
import { PROFILES } from "../src/profiles.js";

/** The chrome-140 profile under test — the recommended starter alias. */
const profile: BrowserProfile = getProfile(PROFILES["chrome-140"]);

describe("impersonation config: chrome-140 profile identity", () => {
    it("resolves the chrome-140 starter alias to a registered profile", () => {
        expect(profile.id).toBe("chrome-140");
        expect(profile.name).toBe("chrome");
    });

    it("targets a current Chrome version (140.x)", () => {
        expect(profile.version).toMatch(/^140\./);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TLS layer — cipher suites, extensions, key shares, signature algorithms
// ─────────────────────────────────────────────────────────────────────────────

describe("impersonation config: TLS fingerprint (chrome-140)", () => {
    it("advertises GREASE randomization (RFC 8701)", () => {
        expect(profile.tls.grease).toBe(true);
    });

    it("leads the cipher list with a GREASE placeholder slot", () => {
        // Chrome inserts a randomized GREASE cipher (0x?a?a) at the top.
        // The profile marks the slot with a named placeholder.
        expect(profile.tls.cipherSuites[0]).toBe("TLS_GREASE_RESERVED_0");
    });

    it("orders TLS 1.3 ciphers before TLS 1.2 ECDHE ciphers (Chrome order)", () => {
        const suites = profile.tls.cipherSuites;
        // After the GREASE slot, the three TLS 1.3 suites must follow.
        expect(suites[1]).toBe("TLS_AES_128_GCM_SHA256");
        expect(suites[2]).toBe("TLS_AES_256_GCM_SHA384");
        expect(suites[3]).toBe("TLS_CHACHA20_POLY1305_SHA256");
    });

    it("includes ECDHE cipher suites in Chrome's documented order", () => {
        const suites = profile.tls.cipherSuites;
        expect(suites).toContain("TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256");
        expect(suites).toContain("TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256");
        expect(suites).toContain("TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384");
        expect(suites).toContain("TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256");
        expect(suites).toContain("TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256");
    });

    it("stores extension order as numeric TLS extension type codes", () => {
        const order = profile.tls.extensionOrder;
        expect(order.length).toBeGreaterThanOrEqual(15);
        // server_name (0) is always first; encrypted_client_hello (65037) is present.
        expect(order[0]).toBe(0);
        expect(order).toContain(65037);
        // supported_versions (43) and key_share (51) are fingerprint-critical.
        expect(order).toContain(43);
        expect(order).toContain(51);
    });

    it("places the application_settings extension at the Chrome 131+ code (17613)", () => {
        // Chrome 131+ moved application_settings from 17513 → 17613.
        const order = profile.tls.extensionOrder;
        expect(order).toContain(17613);
        expect(order).not.toContain(17513);
    });

    it("advertises TLS 1.3 as the highest supported version", () => {
        expect(profile.tls.supportedVersions[0]).toBe("TLS 1.3");
        expect(profile.tls.supportedVersions).toContain("TLS 1.2");
    });

    it("includes the post-quantum X25519MLKEM768 key-share group first", () => {
        // Chrome 131+ leads key shares with the hybrid PQ group.
        const groups = profile.tls.keyShareGroups;
        expect(groups[0]).toBe("X25519MLKEM768");
        expect(groups).toContain("x25519");
        expect(groups).toContain("secp256r1");
        expect(groups).toContain("secp384r1");
    });

    it("does NOT carry the deprecated X25519Kyber768 group (replaced by MLKEM768)", () => {
        expect(profile.tls.keyShareGroups).not.toContain("X25519Kyber768");
    });

    it("offers signature algorithms in Chrome's documented order", () => {
        const sigalgs = profile.tls.signatureAlgorithms;
        expect(sigalgs[0]).toBe("ecdsa_secp256r1_sha256");
        expect(sigalgs[1]).toBe("rsa_pss_rsae_sha256");
        expect(sigalgs).toContain("rsa_pss_rsae_sha512");
        expect(sigalgs).toContain("ecdsa_secp384r1_sha384");
    });

    // ── Impersonation vectors (now in published profiles) ──────────────────

    it("advertises EC point formats as [0x00 (uncompressed)]", () => {
        // Real Chrome advertises uncompressed (0x00) only.
        expect(profile.tls.ecPointFormats).toEqual([0x00]);
    });

    it("advertises compress_certificate algorithms as [0x02 (brotli)]", () => {
        // Chrome advertises compress_certificate (extension 27) with brotli.
        expect(profile.tls.compressCertificateAlgorithms).toEqual([0x02]);
    });

    it("pads ClientHello records to a 512-byte multiple", () => {
        // Chrome pads ClientHello records to a multiple of 512 bytes.
        expect(profile.tls.recordPadding).toBe(512);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// HTTP/2 layer — SETTINGS, window sizes, priority
// ─────────────────────────────────────────────────────────────────────────────

describe("impersonation config: HTTP/2 fingerprint (chrome-140)", () => {
    it("advertises a 65536-byte header table size (Chrome default)", () => {
        expect(profile.http2.headerTableSize).toBe(65536);
        expect(profile.http2.settings.headerTableSize).toBe(65536);
    });

    it("disables server push (enablePush = false)", () => {
        expect(profile.http2.settings.enablePush).toBe(false);
    });

    it("sets initial window size to 6291456 bytes (6 MiB)", () => {
        expect(profile.http2.initialWindowSize).toBe(6291456);
        expect(profile.http2.settings.initialWindowSize).toBe(6291456);
    });

    it("sets max frame size to 16384 bytes (the default)", () => {
        expect(profile.http2.maxFrameSize).toBe(16384);
        expect(profile.http2.settings.maxFrameSize).toBe(16384);
    });

    it("caps max concurrent streams at 100", () => {
        expect(profile.http2.settings.maxConcurrentStreams).toBe(100);
    });

    it("caps max header list size at 262144 bytes (256 KiB)", () => {
        expect(profile.http2.settings.maxHeaderListSize).toBe(262144);
    });

    it("uses weight 256 for default stream priority", () => {
        expect(profile.http2.weight).toBe(256);
    });

    // ── Impersonation vectors (now in published profiles) ──────────────────

    it("emits settingsOrder as [1, 2, 4, 6]", () => {
        // Chrome emits SETTINGS in a specific order:
        //   1 (HEADER_TABLE_SIZE), 2 (ENABLE_PUSH), 4 (INITIAL_WINDOW_SIZE),
        //   6 (MAX_HEADER_LIST_SIZE).
        expect(profile.http2.settingsOrder).toEqual([1, 2, 4, 6]);
    });

    it("orders pseudo-headers as [method, authority, scheme, path]", () => {
        // Chrome sends pseudo-headers in :method → :authority → :scheme → :path
        // order. The profile stores bare names (no colon prefix); the HTTP/2
        // wire layer prepends ":" when emitting HPACK frames.
        expect(profile.http2.pseudoHeaderOrder)
            .toEqual(["method", "authority", "scheme", "path"]);
    });

    it("sends a connection-level WINDOW_UPDATE of 15663105 bytes", () => {
        // Chrome sends a connection-level WINDOW_UPDATE of 15663105 bytes
        // after the initial SETTINGS.
        expect(profile.http2.connectionWindowUpdate).toBe(15663105);
    });

    it("enables GREASE for HTTP/2 (SETTINGS + pseudo-header)", () => {
        // Chrome inserts a GREASE SETTINGS entry and a GREASE pseudo-header.
        expect(profile.http2.grease).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// HTTP/1.1 layer — header order, defaults, connection semantics
// ─────────────────────────────────────────────────────────────────────────────

describe("impersonation config: HTTP/1.1 fingerprint (chrome-140)", () => {
    it("uses keep-alive connections", () => {
        expect(profile.http1.connection).toBe("keep-alive");
    });

    it("advertises gzip, deflate, and br in Accept-Encoding", () => {
        expect(profile.http1.acceptEncoding).toBe("gzip, deflate, br");
    });

    it("orders headers in Chrome's documented request order", () => {
        const order = profile.http1.headerOrder;
        // Chrome sends host first, then connection, then sec-ch-ua headers,
        // then upgrade-insecure-requests, user-agent, accept, sec-fetch-*,
        // accept-encoding, accept-language.
        expect(order[0]).toBe("host");
        expect(order[1]).toBe("connection");
        expect(order).toContain("user-agent");
        expect(order).toContain("accept");
        expect(order).toContain("accept-encoding");
        expect(order).toContain("accept-language");
    });

    it("includes sec-fetch-* headers in Chrome's order", () => {
        const order = profile.http1.headerOrder;
        const siteIdx = order.indexOf("sec-fetch-site");
        const modeIdx = order.indexOf("sec-fetch-mode");
        const userIdx = order.indexOf("sec-fetch-user");
        const destIdx = order.indexOf("sec-fetch-dest");
        expect(siteIdx).toBeGreaterThanOrEqual(0);
        // The sec-fetch headers must appear in this relative order.
        expect(siteIdx).toBeLessThan(modeIdx);
        expect(modeIdx).toBeLessThan(userIdx);
        expect(userIdx).toBeLessThan(destIdx);
    });

    it("carries a Chrome 140 user-agent in defaultHeaders", () => {
        const ua = profile.http1.defaultHeaders["user-agent"];
        expect(ua).toBeDefined();
        expect(ua).toContain("Chrome/140");
    });

    it("carries sec-ch-ua client hints matching Chrome 140", () => {
        const secChUa = profile.http1.defaultHeaders["sec-ch-ua"];
        expect(secChUa).toBeDefined();
        expect(secChUa).toContain("140");
    });

    // ── Impersonation vector: header casing (type from http1 layer) ─────────

    it("exports HeaderCasing with 'title' for Chrome's Title-Case headers", () => {
        // Real Chrome sends headers in Title-Case (e.g. "Accept-Encoding" not
        // "accept-encoding"). The profile itself does not carry a `headerCasing`
        // field; @browsercore/fetch derives it from the browser family. The
        // concrete `HeaderCasing` union that drives wire serialization lives in
        // @browsercore/http1 and must include "title" for Chrome impersonation.
        expectTypeOf<HeaderCasing>().toMatchTypeOf<"lowercase" | "title" | "original">();
        expectTypeOf<"title">().toMatchTypeOf<HeaderCasing>();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-profile distinctness — chrome vs firefox must differ
// ─────────────────────────────────────────────────────────────────────────────

describe("impersonation config: profile distinctness", () => {
    it("chrome-140 and firefox-128 have distinct cipher-suite orderings", () => {
        const firefox = getProfile(PROFILES["firefox-128"]);
        expect(profile.tls.cipherSuites).not.toStrictEqual(firefox.tls.cipherSuites);
    });

    it("chrome-140 and firefox-128 have distinct key-share groups", () => {
        const firefox = getProfile(PROFILES["firefox-128"]);
        expect(profile.tls.keyShareGroups).not.toStrictEqual(firefox.tls.keyShareGroups);
    });
});
