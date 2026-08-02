/**
 * Microsoft Edge fingerprint definitions.
 *
 * Edge is Chromium-based, so its TLS fingerprint is close to Chrome's — same
 * GREASE behavior, same cipher families — but differs in the advertised user
 * agent string, the `sec-ch-ua` brand list (includes "Microsoft Edge"), and a
 * slightly different extension order. HTTP/2 settings track Chrome closely.
 * Values mirror real Edge captures per version.
 */

import type { BrowserProfile, ProfileId } from "../types.js";

const GREASE = "TLS_GREASE_RESERVED_0";

const edgeTlsBase = {
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

const edgeHttp2Base = {
    initialWindowSize: 6291456,
    maxFrameSize: 16384,
    headerTableSize: 65536,
    weight: 256,
} as const;

const edgeHttp1Base = {
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

export const edge120: BrowserProfile = {
    id: "edge-120" as ProfileId,
    name: "edge",
    version: "120.0.2210.91",
    tls: {
        ...edgeTlsBase,
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
        ...edgeHttp2Base,
        settings: {
            headerTableSize: 65536,
            enablePush: false,
            maxConcurrentStreams: 100,
            initialWindowSize: 6291456,
            maxFrameSize: 16384,
        },
    },
    http1: {
        ...edgeHttp1Base,
        defaultHeaders: {
            "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Microsoft Edge";v="120"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"macOS"',
            "upgrade-insecure-requests": "1",
            "user-agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
            "sec-fetch-site": "none",
            "sec-fetch-mode": "navigate",
            "sec-fetch-user": "?1",
            "sec-fetch-dest": "document",
            "accept-language": "en-US,en;q=0.9",
        },
    },
};

export const edge128: BrowserProfile = {
    id: "edge-128" as ProfileId,
    name: "edge",
    version: "128.0.2739.70",
    tls: {
        ...edgeTlsBase,
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
        ...edgeHttp2Base,
        settings: {
            headerTableSize: 65536,
            enablePush: false,
            maxConcurrentStreams: 100,
            initialWindowSize: 6291456,
            maxFrameSize: 16384,
        },
    },
    http1: {
        ...edgeHttp1Base,
        defaultHeaders: {
            "sec-ch-ua": '"Chromium";v="128", "Not;A=Brand";v="24", "Microsoft Edge";v="128"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"macOS"',
            "upgrade-insecure-requests": "1",
            "user-agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0",
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
            "sec-fetch-site": "none",
            "sec-fetch-mode": "navigate",
            "sec-fetch-user": "?1",
            "sec-fetch-dest": "document",
            "accept-language": "en-US,en;q=0.9",
        },
    },
};

export const EdgeProfiles = {
    edge120,
    edge128,
} as const;
