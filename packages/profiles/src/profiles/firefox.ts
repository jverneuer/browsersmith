/**
 * Firefox fingerprint definitions.
 *
 * Firefox uses a distinct cipher order from Chrome, does NOT enable GREASE, and
 * advertises a different TLS extension set. HTTP/2 settings are more conservative
 * (smaller initial window). Values mirror real Firefox captures per version.
 */

import type { BrowserProfile, ProfileId } from "../types.js";

const firefoxTlsBase = {
    extensionOrder: [
        0, 10, 11, 13, 16, 18, 23, 35, 41, 43, 45, 51, 65281,
    ],
    supportedVersions: ["TLS 1.3", "TLS 1.2"],
    keyShareGroups: ["x25519", "secp256r1", "secp384r1"],
    signatureAlgorithms: [
        "ecdsa_secp256r1_sha256",
        "ecdsa_secp384r1_sha384",
        "ed25519",
        "rsa_pss_rsae_sha256",
        "rsa_pss_rsae_sha384",
        "rsa_pkcs1_sha256",
        "rsa_pkcs1_sha384",
        "rsa_pkcs1_sha1",
    ],
    grease: false,
} as const;

const firefoxHttp2Base = {
    initialWindowSize: 12582912,
    maxFrameSize: 16384,
    headerTableSize: 65536,
    weight: 256,
} as const;

const firefoxHttp1Base = {
    connection: "keep-alive" as const,
    acceptEncoding: "gzip, deflate, br",
    headerOrder: [
        "host",
        "user-agent",
        "accept",
        "accept-language",
        "accept-encoding",
        "connection",
        "upgrade-insecure-requests",
        "sec-fetch-dest",
        "sec-fetch-mode",
        "sec-fetch-site",
        "sec-fetch-user",
    ],
} as const;

export const firefox120: BrowserProfile = {
    id: "firefox-120" as ProfileId,
    name: "firefox",
    version: "120.0",
    tls: {
        ...firefoxTlsBase,
        cipherSuites: [
            "TLS_AES_128_GCM_SHA256",
            "TLS_CHACHA20_POLY1305_SHA256",
            "TLS_AES_256_GCM_SHA384",
            "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
            "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
            "TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256",
            "TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256",
            "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384",
            "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
            "TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA",
            "TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA",
            "TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA",
            "TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA",
            "TLS_RSA_WITH_AES_128_GCM_SHA256",
            "TLS_RSA_WITH_AES_256_GCM_SHA384",
            "TLS_RSA_WITH_AES_128_CBC_SHA",
            "TLS_RSA_WITH_AES_256_CBC_SHA",
        ],
    },
    http2: {
        ...firefoxHttp2Base,
        settings: {
            headerTableSize: 65536,
            enablePush: false,
            maxConcurrentStreams: 100,
            initialWindowSize: 12582912,
            maxFrameSize: 16384,
        },
    },
    http1: {
        ...firefoxHttp1Base,
        defaultHeaders: {
            "user-agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0",
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "accept-language": "en-US,en;q=0.5",
            "upgrade-insecure-requests": "1",
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "none",
            "sec-fetch-user": "?1",
        },
    },
};

export const firefox128: BrowserProfile = {
    id: "firefox-128" as ProfileId,
    name: "firefox",
    version: "128.0",
    tls: {
        ...firefoxTlsBase,
        cipherSuites: [
            "TLS_AES_128_GCM_SHA256",
            "TLS_CHACHA20_POLY1305_SHA256",
            "TLS_AES_256_GCM_SHA384",
            "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
            "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
            "TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256",
            "TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256",
            "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384",
            "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
            "TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA",
            "TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA",
            "TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA",
            "TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA",
            "TLS_RSA_WITH_AES_128_GCM_SHA256",
            "TLS_RSA_WITH_AES_256_GCM_SHA384",
            "TLS_RSA_WITH_AES_128_CBC_SHA",
            "TLS_RSA_WITH_AES_256_CBC_SHA",
        ],
    },
    http2: {
        ...firefoxHttp2Base,
        settings: {
            headerTableSize: 65536,
            enablePush: false,
            maxConcurrentStreams: 100,
            initialWindowSize: 12582912,
            maxFrameSize: 16384,
        },
    },
    http1: {
        ...firefoxHttp1Base,
        defaultHeaders: {
            "user-agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) Gecko/20100101 Firefox/128.0",
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "accept-language": "en-US,en;q=0.5",
            "upgrade-insecure-requests": "1",
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "none",
            "sec-fetch-user": "?1",
        },
    },
};

export const firefox135: BrowserProfile = {
    id: "firefox-135" as ProfileId,
    name: "firefox",
    version: "135.0",
    tls: {
        ...firefoxTlsBase,
        cipherSuites: [
            "TLS_AES_128_GCM_SHA256",
            "TLS_CHACHA20_POLY1305_SHA256",
            "TLS_AES_256_GCM_SHA384",
            "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
            "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
            "TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256",
            "TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256",
            "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384",
            "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
            "TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA",
            "TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA",
            "TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA",
            "TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA",
            "TLS_RSA_WITH_AES_128_GCM_SHA256",
            "TLS_RSA_WITH_AES_256_GCM_SHA384",
            "TLS_RSA_WITH_AES_128_CBC_SHA",
            "TLS_RSA_WITH_AES_256_CBC_SHA",
        ],
    },
    http2: {
        ...firefoxHttp2Base,
        settings: {
            headerTableSize: 65536,
            enablePush: false,
            maxConcurrentStreams: 128,
            initialWindowSize: 12582912,
            maxFrameSize: 16384,
        },
    },
    http1: {
        ...firefoxHttp1Base,
        defaultHeaders: {
            "user-agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:135.0) Gecko/20100101 Firefox/135.0",
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "accept-language": "en-US,en;q=0.5",
            "upgrade-insecure-requests": "1",
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "none",
            "sec-fetch-user": "?1",
        },
    },
};

export const FirefoxProfiles = {
    firefox120,
    firefox128,
    firefox135,
} as const;
