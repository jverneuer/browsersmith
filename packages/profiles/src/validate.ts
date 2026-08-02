/**
 * Profile validation against real captures.
 *
 * Real Wireshark / JA4 captures are produced later by the testing package; this
 * module is the reusable utility that consumes them. It projects a profile's TLS
 * fields onto the wire values a ClientHello would carry, then compares those
 * expectations to a captured ClientHello, reporting diffs.
 *
 * A key honesty: GREASE (RFC 8701) values are randomized per-connection, so a
 * profile cannot predict the exact GREASE bytes. We handle this where the data
 * lets us — cipher suites mark GREASE slots with a named placeholder, so a
 * GREASE slot in the profile matches any GREASE-pattern byte pair in the capture.
 * Extension GREASE is not handled here because the profile stores literal wire
 * codes for extensions (not placeholders), so it cannot robustly flag a GREASE
 * extension slot. See the per-field comments below.
 */

import type { BrowserProfile } from "./types.js";
import type { ProfileDiff } from "./diff.js";
import { ProfileError } from "./errors.js";

/** A captured ClientHello, as parsed out of a packet capture by the testing package. */
export interface TlsCapture {
    /** Offered cipher suites as IANA 2-byte codes, in wire order. */
    readonly cipherSuites: readonly number[];
    /** Extension type codes present, in wire order. */
    readonly extensionTypes: readonly number[];
    /** Supported versions advertised, as 2-byte codes, highest first. */
    readonly supportedVersions: readonly number[];
    /** Key-share named-group ids offered. */
    readonly keyShareGroups: readonly number[];
    /** Signature algorithm codes offered. */
    readonly signatureAlgorithms: readonly number[];
    /** Whether the ClientHello used GREASE randomization. */
    readonly grease: boolean;
    /** Optional JA3 / JA4 strings, when the capture tool computed them. */
    readonly ja3?: string;
    readonly ja4?: string;
}

/** The wire values a profile's ClientHello is expected to carry. */
export interface ClientHelloExpected {
    /** Cipher suites as IANA 2-byte codes, in wire order. */
    readonly cipherSuites: readonly number[];
    /** Extension type codes, in wire order. */
    readonly extensionTypes: readonly number[];
    /** Supported versions as 2-byte codes, highest first. */
    readonly supportedVersions: readonly number[];
    /** Key-share named-group ids. */
    readonly keyShareGroups: readonly number[];
    /** Signature algorithm codes. */
    readonly signatureAlgorithms: readonly number[];
    /** Whether GREASE randomization is expected. */
    readonly grease: boolean;
    /** SNI hostname the client would send, derived from the connection target. */
    readonly sni: string;
}

/** The name Chrome uses in its cipher list to mark a GREASE slot (RFC 8701). */
const CIPHER_GREASE_PLACEHOLDER = "TLS_GREASE_RESERVED_0";

/**
 * IANA TLS Cipher Suite Registry — selected codes.
 *
 * Values are the canonical 2-byte wire codes from
 * <https://www.iana.org/assignments/tls-parameters/tls-parameters.xhtml#tls-parameters-4>.
 * Only the suites used by the shipped profiles are mapped; an unknown name is a
 * bug in a profile definition and throws.
 */
const CIPHER_SUITE_CODES: Readonly<Record<string, number>> = {
    // GREASE: real value is randomized per-connection (0x0a0a..0xfafa). We use the
    // first canonical GREASE code for the expected representation; validation
    // accepts any GREASE-pattern value at a GREASE slot.
    [CIPHER_GREASE_PLACEHOLDER]: 0x0a0a,
    TLS_AES_128_GCM_SHA256: 0x1301,
    TLS_AES_256_GCM_SHA384: 0x1302,
    TLS_CHACHA20_POLY1305_SHA256: 0x1303,
    TLS_AES_128_CCM_SHA256: 0x1304,
    TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256: 0xc02b,
    TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256: 0xc02f,
    TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384: 0xc02c,
    TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384: 0xc030,
    TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256: 0xcca9,
    TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256: 0xcca8,
    TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA: 0xc013,
    TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA: 0xc014,
    TLS_RSA_WITH_AES_128_GCM_SHA256: 0x009c,
    TLS_RSA_WITH_AES_256_GCM_SHA384: 0x009d,
    TLS_RSA_WITH_AES_128_CBC_SHA: 0x002f,
    TLS_RSA_WITH_AES_256_CBC_SHA: 0x0035,
};

/**
 * IANA TLS Supported Groups Registry (named groups) — selected codes.
 * <https://www.iana.org/assignments/tls-parameters/tls-parameters.xhtml#tls-parameters-8>
 */
const NAMED_GROUP_CODES: Readonly<Record<string, number>> = {
    x25519: 0x001d,
    secp256r1: 0x0017,
    secp384r1: 0x0018,
};

/**
 * IANA TLS SignatureScheme Registry — selected codes.
 * <https://www.iana.org/assignments/tls-parameters/tls-parameters.xhtml#tls-parameters-16>
 */
const SIGNATURE_SCHEME_CODES: Readonly<Record<string, number>> = {
    ecdsa_secp256r1_sha256: 0x0403,
    rsa_pss_rsae_sha256: 0x0804,
    rsa_pkcs1_sha256: 0x0401,
    ecdsa_secp384r1_sha384: 0x0503,
    rsa_pss_rsae_sha384: 0x0805,
    rsa_pkcs1_sha384: 0x0501,
};

/** IANA TLS ProtocolVersion codes for the supported_versions extension. */
const VERSION_CODES: Readonly<Record<string, number>> = {
    "TLS 1.3": 0x0304,
    "TLS 1.2": 0x0303,
    "TLS 1.1": 0x0302,
    "TLS 1.0": 0x0301,
};

/** Validation / projection failure (unknown profile value, bad capture, etc.). */
export class ValidationError extends ProfileError {
    public override readonly kind = "ValidationError" as const;

    constructor(message: string, options?: { cause?: Error }) {
        super("ValidationError", message, options);
        this.name = "ValidationError";
    }
}

function lookupCode(
    map: Readonly<Record<string, number>>,
    name: string,
    field: string,
): number {
    const code = map[name];
    if (code === undefined) {
        throw new ValidationError(`Unknown ${field}: ${name}`);
    }
    return code;
}

/** Map a cipher-suite name to its 2-byte IANA code. */
function mapCipherSuite(name: string): number {
    return lookupCode(CIPHER_SUITE_CODES, name, "cipher suite");
}

/** Map a named-group name to its IANA id. */
function mapNamedGroup(name: string): number {
    return lookupCode(NAMED_GROUP_CODES, name, "named group");
}

/** Map a signature-scheme name to its IANA code. */
function mapSignatureScheme(name: string): number {
    return lookupCode(SIGNATURE_SCHEME_CODES, name, "signature scheme");
}

/** Map a TLS version string to its 2-byte wire code. */
function mapVersion(name: string): number {
    return lookupCode(VERSION_CODES, name, "TLS version");
}

/**
 * Project a profile's TLS fields onto the wire values its ClientHello should
 * carry for a connection to `serverName`. Extension order is taken verbatim from
 * the profile (already stored as wire codes), since extension order is a
 * fingerprint signal.
 */
export function buildExpectedClientHello(
    profile: BrowserProfile,
    serverName: string,
): ClientHelloExpected {
    return {
        cipherSuites: profile.tls.cipherSuites.map(mapCipherSuite),
        extensionTypes: Array.from(profile.tls.extensionOrder),
        supportedVersions: profile.tls.supportedVersions.map(mapVersion),
        keyShareGroups: profile.tls.keyShareGroups.map(mapNamedGroup),
        signatureAlgorithms: profile.tls.signatureAlgorithms.map(mapSignatureScheme),
        grease: profile.tls.grease,
        sni: serverName,
    };
}

/** A 2-byte value matches the GREASE pattern 0x?a?a (high byte === low byte). */
function isGreaseValue(v: number): boolean {
    return (v >> 8) === (v & 0xff);
}

/**
 * Element-wise diff of two numeric arrays, reporting one {@link ProfileDiff} per
 * mismatched index (including length differences).
 */
function diffNumberArray(
    path: string,
    expected: readonly number[],
    actual: readonly number[],
    out: ProfileDiff[],
): void {
    const n = Math.max(expected.length, actual.length);
    for (let i = 0; i < n; i++) {
        const e = expected[i];
        const c = actual[i];
        if (e !== c) {
            out.push({ path: `${path}[${i}]`, a: e, b: c });
        }
    }
}

/** Diff cipher suites with GREASE awareness: a GREASE slot matches any GREASE-pattern value. */
function diffCipherSuites(
    profile: BrowserProfile,
    expected: readonly number[],
    capture: readonly number[],
    out: ProfileDiff[],
): void {
    const n = Math.max(expected.length, capture.length);
    for (let i = 0; i < n; i++) {
        const path = `tls.cipherSuites[${i}]`;
        const e = expected[i];
        const c = capture[i];
        const greaseSlot = profile.tls.cipherSuites[i] === CIPHER_GREASE_PLACEHOLDER;
        if (greaseSlot) {
            // Profile reserves a GREASE slot; accept any GREASE-pattern value, but a
            // missing or non-GREASE value is still a mismatch.
            if (c === undefined || !isGreaseValue(c)) {
                out.push({ path, a: e, b: c });
            }
            continue;
        }
        if (e !== c) {
            out.push({ path, a: e, b: c });
        }
    }
}

/**
 * Validate a profile against a captured ClientHello.
 *
 * Returns `ok: true` when every field matches (respecting GREASE randomization
 * for cipher suites), and the list of diffs otherwise. SNI is not compared
 * because captures do not record the destination hostname.
 */
export function validateProfileAgainstCapture(
    profile: BrowserProfile,
    capture: TlsCapture,
): { ok: boolean; diffs: ProfileDiff[] } {
    const expected = buildExpectedClientHello(profile, "");
    const diffs: ProfileDiff[] = [];

    diffCipherSuites(profile, expected.cipherSuites, capture.cipherSuites, diffs);
    diffNumberArray("tls.extensionTypes", expected.extensionTypes, capture.extensionTypes, diffs);
    diffNumberArray("tls.supportedVersions", expected.supportedVersions, capture.supportedVersions, diffs);
    diffNumberArray("tls.keyShareGroups", expected.keyShareGroups, capture.keyShareGroups, diffs);
    diffNumberArray(
        "tls.signatureAlgorithms",
        expected.signatureAlgorithms,
        capture.signatureAlgorithms,
        diffs,
    );

    if (expected.grease !== capture.grease) {
        diffs.push({ path: "tls.grease", a: expected.grease, b: capture.grease });
    }

    return { ok: diffs.length === 0, diffs };
}
