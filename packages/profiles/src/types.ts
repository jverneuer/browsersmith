/**
 * Domain types for @browsercore/profiles.
 *
 * Pure data: this package defines WHAT a browser fingerprint looks like, never
 * HOW to emit it on the wire. Protocol implementations (tls, http1, http2) read
 * these definitions and translate them into bytes / header order / settings frames.
 */

/** Branded browser-profile identifier (e.g. "chrome-140"). */
export type ProfileId = string & { __brand: "ProfileId" };

/** Known browser families. Discriminated-union literal set. */
export type ProfileName =
    | "chrome"
    | "firefox"
    | "safari"
    | "edge";

/** TLS-layer fingerprint: everything a TLS client hello reveals about the client. */
export interface TlsProfile {
    /** Ordered list of offered cipher suites (IANA names). Order matters for fingerprinting. */
    readonly cipherSuites: readonly string[];
    /** Order of TLS extensions in the ClientHello. */
    readonly extensionOrder: readonly number[];
    /** Supported TLS versions, highest first. */
    readonly supportedVersions: readonly string[];
    /** Key-share groups offered (TLS 1.3). */
    readonly keyShareGroups: readonly string[];
    /** Signature algorithms offered. */
    readonly signatureAlgorithms: readonly string[];
    /** record_size_limit extension value, if advertised. Absent when not sent. */
    readonly recordSizeLimit?: number;
    /** Whether this browser randomizes with GREASE values (RFC 8701). */
    readonly grease: boolean;
}

/** HTTP/2 SETTINGS + tuning parameters. */
export interface Http2Profile {
    /** HTTP/2 settings the client sends in its first SETTINGS frame. */
    readonly settings: Partial<Http2Settings>;
    /** Initial TCP-level / stream window size in bytes. */
    readonly initialWindowSize: number;
    /** SETTINGS_MAX_FRAME_SIZE advertised by the client. */
    readonly maxFrameSize: number;
    /** SETTINGS_HEADER_TABLE_SIZE advertised by the client. */
    readonly headerTableSize: number;
    /** Default stream weight (1-256). */
    readonly weight: number;
    /** Default priority dependency / exclusive flag, if any. */
    readonly priority?: Http2Priority;
}

/** HTTP/2 numeric settings (RFC 9113 §6.5.1). */
export interface Http2Settings {
    readonly headerTableSize: number;
    readonly enablePush: boolean;
    readonly maxConcurrentStreams: number;
    readonly initialWindowSize: number;
    readonly maxFrameSize: number;
    readonly maxHeaderListSize: number;
}

/** HTTP/2 stream priority descriptor. */
export interface Http2Priority {
    readonly streamDependency: number;
    readonly exclusive: boolean;
    readonly weight: number;
}

/** HTTP/1.1-layer fingerprint: header defaults and ordering. */
export interface Http1Profile {
    /** Default headers sent on every request, in order. */
    readonly defaultHeaders: Readonly<Record<string, string>>;
    /** Order in which headers are serialized (client-enforced). */
    readonly headerOrder: readonly string[];
    /** Connection header value. */
    readonly connection: "keep-alive" | "close";
    /** Accept-Encoding value sent by default. */
    readonly acceptEncoding: string;
}

/** A complete browser fingerprint across all layers. */
export interface BrowserProfile {
    readonly id: ProfileId;
    /** Human-readable browser name. */
    readonly name: string;
    /** Browser version string (e.g. "140.0.7339.18"). */
    readonly version: string;
    readonly tls: TlsProfile;
    readonly http2: Http2Profile;
    readonly http1: Http1Profile;
}
