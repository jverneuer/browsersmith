/**
 * Chrome fingerprint definitions.
 *
 * TLS values mirror real Chrome ClientHello captures (JA3 / JA4 style). Chrome
 * enables GREASE (RFC 8701), advertises TLS 1.3, and sends a stable cipher order
 * per release. HTTP/2 settings track Chrome's real SETTINGS frame. Values are
 * accurate for the listed versions unless noted otherwise.
 */

import type { BrowserProfile, ProfileId } from "../types.js";

/** TLS 1.3 GREASE placeholder cipher (0x?a?a) Chrome inserts at the top of the list. */
const GREASE = "TLS_GREASE_RESERVED_0";

const chromeTlsBase = {
    extensionOrder: [
        0, 10, 11, 13, 16, 17513, 18, 23, 27, 35, 41, 43, 45, 5, 51, 65281,
    ],
    supportedVersions: ["TLS 1.3", "TLS 1.2"],
    keyShareGroups: ["x25519", "secp256r1"],
    signatureAlgorithms: [
        "ecdsa_secp256r1_sha256",
        "rsa_pss_rsae_sha256",
        "rsa_pkcs1_sha256",
        "ecdsa_secp384r1_sha384",
        "rsa_pss_rsae_sha384",
        "rsa_pkcs1_sha384",
    ],
    grease: true,
} as const;

const chromeHttp2Base = {
    initialWindowSize: 6291456,
    maxFrameSize: 16384,
    headerTableSize: 65536,
    weight: 256,
} as const;

const chromeHttp1Base = {
    connection: "keep-alive" as const,
    acceptEncoding: "gzip, deflate, br",
    headerOrder: [
        "host",
        "connection",
        "sec-ch-ua",
        "sec-ch-ua-mobile",
        "sec-ch-ua-platform",
        "upgrade-insecure-requests",
        "user-agent",
        "accept",
        "sec-fetch-site",
        "sec-fetch-mode",
        "sec-fetch-user",
        "sec-fetch-dest",
        "accept-encoding",
        "accept-language",
    ],
} as const;

export const chrome120: BrowserProfile = {
    id: "chrome-120" as ProfileId,
    name: "chrome",
    version: "120.0.6099.71",
    tls: {
        ...chromeTlsBase,
        cipherSuites: [
            GREASE,
            "TLS_AES_128_GCM_SHA256",
            "TLS_AES_256_GCM_SHA384",
            "TLS_CHACHA20_POLY1305_SHA256",
            "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
            "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
            "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384",
            "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
            "TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256",
            "TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256",
            "TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA",
            "TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA",
            "TLS_RSA_WITH_AES_128_GCM_SHA256",
            "TLS_RSA_WITH_AES_256_GCM_SHA384",
            "TLS_RSA_WITH_AES_128_CBC_SHA",
            "TLS_RSA_WITH_AES_256_CBC_SHA",
        ],
    },
    http2: {
        ...chromeHttp2Base,
        settings: {
            headerTableSize: 65536,
            enablePush: false,
            maxConcurrentStreams: 100,
            initialWindowSize: 6291456,
            maxFrameSize: 16384,
        },
    },
    http1: {
        ...chromeHttp1Base,
        defaultHeaders: {
            "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"macOS"',
            "upgrade-insecure-requests": "1",
            "user-agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "sec-fetch-site": "none",
            "sec-fetch-mode": "navigate",
            "sec-fetch-user": "?1",
            "sec-fetch-dest": "document",
            "accept-language": "en-US,en;q=0.9",
        },
    },
};

export const chrome128: BrowserProfile = {
    id: "chrome-128" as ProfileId,
    name: "chrome",
    version: "128.0.6613.137",
    tls: {
        ...chromeTlsBase,
        cipherSuites: [
            GREASE,
            "TLS_AES_128_GCM_SHA256",
            "TLS_AES_256_GCM_SHA384",
            "TLS_CHACHA20_POLY1305_SHA256",
            "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
            "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
            "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384",
            "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
            "TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256",
            "TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256",
            "TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA",
            "TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA",
            "TLS_RSA_WITH_AES_128_GCM_SHA256",
            "TLS_RSA_WITH_AES_256_GCM_SHA384",
            "TLS_RSA_WITH_AES_128_CBC_SHA",
            "TLS_RSA_WITH_AES_256_CBC_SHA",
        ],
    },
    http2: {
        ...chromeHttp2Base,
        settings: {
            headerTableSize: 65536,
            enablePush: false,
            maxConcurrentStreams: 100,
            initialWindowSize: 6291456,
            maxFrameSize: 16384,
        },
    },
    http1: {
        ...chromeHttp1Base,
        defaultHeaders: {
            "sec-ch-ua": '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"macOS"',
            "upgrade-insecure-requests": "1",
            "user-agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "sec-fetch-site": "none",
            "sec-fetch-mode": "navigate",
            "sec-fetch-user": "?1",
            "sec-fetch-dest": "document",
            "accept-language": "en-US,en;q=0.9",
        },
    },
};

export const chrome140: BrowserProfile = {
    id: "chrome-140" as ProfileId,
    name: "chrome",
    version: "140.0.7339.18",
    tls: {
        ...chromeTlsBase,
        cipherSuites: [
            GREASE,
            "TLS_AES_128_GCM_SHA256",
            "TLS_AES_256_GCM_SHA384",
            "TLS_CHACHA20_POLY1305_SHA256",
            "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
            "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
            "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384",
            "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
            "TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256",
            "TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256",
            "TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA",
            "TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA",
            "TLS_RSA_WITH_AES_128_GCM_SHA256",
            "TLS_RSA_WITH_AES_256_GCM_SHA384",
            "TLS_RSA_WITH_AES_128_CBC_SHA",
            "TLS_RSA_WITH_AES_256_CBC_SHA",
        ],
    },
    http2: {
        ...chromeHttp2Base,
        settings: {
            headerTableSize: 65536,
            enablePush: false,
            maxConcurrentStreams: 100,
            initialWindowSize: 6291456,
            maxFrameSize: 16384,
        },
    },
    http1: {
        ...chromeHttp1Base,
        defaultHeaders: {
            "sec-ch-ua": '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"macOS"',
            "upgrade-insecure-requests": "1",
            "user-agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "sec-fetch-site": "none",
            "sec-fetch-mode": "navigate",
            "sec-fetch-user": "?1",
            "sec-fetch-dest": "document",
            "accept-language": "en-US,en;q=0.9",
        },
    },
};

export const ChromeProfiles = {
    chrome120,
    chrome128,
    chrome140,
} as const;
