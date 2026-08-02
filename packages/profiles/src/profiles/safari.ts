/**
 * Safari fingerprint definitions.
 *
 * Safari (WebKit) has a distinct TLS fingerprint: it enables GREASE, uses a
 * unique cipher order that prioritizes ChaCha20 less aggressively than Chrome,
 * and advertises a smaller set of signature algorithms. HTTP/2 settings are
 * conservative. Values mirror real Safari/WebKit captures per version.
 */

import type { BrowserProfile, ProfileId } from "../types.js";

const safariTlsBase = {
    extensionOrder: [
        0, 10, 11, 13, 16, 18, 23, 35, 41, 43, 45, 51, 65281,
    ],
    supportedVersions: ["TLS 1.3", "TLS 1.2"],
    keyShareGroups: ["x25519", "secp256r1"],
    signatureAlgorithms: [
        "ecdsa_secp256r1_sha256",
        "rsa_pss_rsae_sha256",
        "rsa_pkcs1_sha256",
    ],
    grease: true,
} as const;

const safariHttp2Base = {
    initialWindowSize: 1048576,
    maxFrameSize: 16384,
    headerTableSize: 65536,
    weight: 256,
} as const;

const safariHttp1Base = {
    connection: "keep-alive" as const,
    acceptEncoding: "gzip, deflate, br",
    headerOrder: [
        "host",
        "accept",
        "accept-encoding",
        "accept-language",
        "user-agent",
        "connection",
    ],
} as const;

export const safari17: BrowserProfile = {
    id: "safari-17" as ProfileId,
    name: "safari",
    version: "17.6",
    tls: {
        ...safariTlsBase,
        cipherSuites: [
            "TLS_AES_128_GCM_SHA256",
            "TLS_AES_256_GCM_SHA384",
            "TLS_CHACHA20_POLY1305_SHA256",
            "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384",
            "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
            "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
            "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
            "TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256",
            "TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256",
            "TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA384",
            "TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA256",
            "TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA384",
            "TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256",
            "TLS_RSA_WITH_AES_256_GCM_SHA384",
            "TLS_RSA_WITH_AES_128_GCM_SHA256",
            "TLS_RSA_WITH_AES_256_CBC_SHA256",
            "TLS_RSA_WITH_AES_128_CBC_SHA256",
        ],
    },
    http2: {
        ...safariHttp2Base,
        settings: {
            headerTableSize: 65536,
            enablePush: false,
            maxConcurrentStreams: 100,
            initialWindowSize: 1048576,
            maxFrameSize: 16384,
        },
    },
    http1: {
        ...safariHttp1Base,
        defaultHeaders: {
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "accept-language": "en-US,en;q=0.9",
            "user-agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
        },
    },
};

export const safari18: BrowserProfile = {
    id: "safari-18" as ProfileId,
    name: "safari",
    version: "18.1",
    tls: {
        ...safariTlsBase,
        cipherSuites: [
            "TLS_AES_128_GCM_SHA256",
            "TLS_AES_256_GCM_SHA384",
            "TLS_CHACHA20_POLY1305_SHA256",
            "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384",
            "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
            "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
            "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
            "TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256",
            "TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256",
            "TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA384",
            "TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA256",
            "TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA384",
            "TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256",
            "TLS_RSA_WITH_AES_256_GCM_SHA384",
            "TLS_RSA_WITH_AES_128_GCM_SHA256",
            "TLS_RSA_WITH_AES_256_CBC_SHA256",
            "TLS_RSA_WITH_AES_128_CBC_SHA256",
        ],
    },
    http2: {
        ...safariHttp2Base,
        settings: {
            headerTableSize: 65536,
            enablePush: false,
            maxConcurrentStreams: 100,
            initialWindowSize: 1048576,
            maxFrameSize: 16384,
        },
    },
    http1: {
        ...safariHttp1Base,
        defaultHeaders: {
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "accept-language": "en-US,en;q=0.9",
            "user-agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
        },
    },
};

export const SafariProfiles = {
    safari17,
    safari18,
} as const;
