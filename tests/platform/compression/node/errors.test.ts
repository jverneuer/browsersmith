/**
 * Error-semantics tests for @browsercore/compression.
 *
 * Errors are part of the public API — callers match on `kind` and read
 * `encoding`/`cause`. These pin down the class hierarchy, discriminator,
 * cause-chain preservation, and message formatting so the surface stays stable.
 */

import { describe, expect, it } from "vitest";

import { NodeZlibCompressionProvider } from "../../../../src/platform/compression/node/compression.js";
import {
    CompressionError,
    DecompressionError,
    UnsupportedEncodingError,
    assertNever,
    ensureCompressionError,
} from "@browsercore/compression";

const provider = new NodeZlibCompressionProvider();

describe("error class hierarchy", () => {
    it("UnsupportedEncodingError extends CompressionError", () => {
        expect(new UnsupportedEncodingError("sdch")).toBeInstanceOf(CompressionError);
    });

    it("DecompressionError extends CompressionError", () => {
        expect(new DecompressionError("gzip")).toBeInstanceOf(CompressionError);
    });

    it("CompressionError extends Error", () => {
        expect(new CompressionError("boom")).toBeInstanceOf(Error);
    });

    it("subclass instances are still instanceof their base classes", () => {
        const e = new DecompressionError("br");
        expect(e).toBeInstanceOf(CompressionError);
        expect(e).toBeInstanceOf(Error);
        const u = new UnsupportedEncodingError("compress");
        expect(u).toBeInstanceOf(CompressionError);
        expect(u).toBeInstanceOf(Error);
    });
});

describe("error `name` is set to the concrete class", () => {
    // `new.target.name` in the base constructor sets `name` to whichever
    // subclass was actually constructed — not "Error" and not "CompressionError".
    it("CompressionError.name === 'CompressionError'", () => {
        expect(new CompressionError("x").name).toBe("CompressionError");
    });

    it("UnsupportedEncodingError.name === 'UnsupportedEncodingError'", () => {
        expect(new UnsupportedEncodingError("sdch").name).toBe("UnsupportedEncodingError");
    });

    it("DecompressionError.name === 'DecompressionError'", () => {
        expect(new DecompressionError("gzip").name).toBe("DecompressionError");
    });
});

describe("error `kind` discriminator", () => {
    it("UnsupportedEncodingError.kind === 'UnsupportedEncodingError'", () => {
        expect(new UnsupportedEncodingError("sdch").kind).toBe("UnsupportedEncodingError");
    });

    it("DecompressionError.kind === 'DecompressionError'", () => {
        expect(new DecompressionError("gzip").kind).toBe("DecompressionError");
    });

    it("kinds are distinct literals (callers can switch on them)", () => {
        const a = new UnsupportedEncodingError("x").kind;
        const b = new DecompressionError("x").kind;
        expect(a).not.toBe(b);
    });
});

describe("error message + payload fields", () => {
    it("UnsupportedEncodingError surfaces the token in message and .encoding", () => {
        const e = new UnsupportedEncodingError("sdch");
        expect(e.encoding).toBe("sdch");
        expect(e.message).toBe("Unsupported content-encoding: sdch");
    });

    it("DecompressionError surfaces the encoding in message and .encoding", () => {
        const e = new DecompressionError("br");
        expect(e.encoding).toBe("br");
        expect(e.message).toBe("Failed to decompress br stream");
    });
});

describe("cause-chain handling", () => {
    it("CompressionError without options has cause undefined", () => {
        expect(new CompressionError("boom").cause).toBeUndefined();
    });

    it("CompressionError with options.cause preserves it", () => {
        const cause = new Error("root");
        expect(new CompressionError("boom", { cause }).cause).toBe(cause);
    });

    it("UnsupportedEncodingError preserves cause", () => {
        const cause = new Error("root");
        expect(new UnsupportedEncodingError("sdch", { cause }).cause).toBe(cause);
    });

    it("DecompressionError preserves cause", () => {
        const cause = new Error("root");
        expect(new DecompressionError("gzip", { cause }).cause).toBe(cause);
    });
});

describe("decodeWith wraps backend errors with the right encoding tag", () => {
    // Each decoder must tag its DecompressionError with the encoding a caller
    // would expect to match against — `gunzip`/`inflate`/`brotliDecompress`
    // tag differently, and `inflateRaw` reports `deflate` (its framing family).
    it("gunzip of corrupt data tags the error with encoding 'gzip'", () => {
        const corrupt = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0xff, 0xff]);
        try {
            provider.gunzip(corrupt);
            throw new Error("expected gunzip to throw");
        } catch (e) {
            expect(e).toBeInstanceOf(DecompressionError);
            expect((e as DecompressionError).encoding).toBe("gzip");
            // The opaque zlib error must be preserved on `cause` for debugging.
            expect((e as DecompressionError).cause).toBeInstanceOf(Error);
        }
    });

    it("inflate of corrupt data tags the error with encoding 'deflate'", () => {
        const corrupt = new Uint8Array([0x78, 0x9c, 0xff, 0xff, 0x00, 0x00]);
        try {
            provider.inflate(corrupt);
            throw new Error("expected inflate to throw");
        } catch (e) {
            expect(e).toBeInstanceOf(DecompressionError);
            expect((e as DecompressionError).encoding).toBe("deflate");
        }
    });

    it("inflateRaw of corrupt data tags the error with encoding 'deflate'", () => {
        // Raw inflate of arbitrary bytes — must fail and be tagged 'deflate'.
        const corrupt = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
        try {
            provider.inflateRaw(corrupt);
            throw new Error("expected inflateRaw to throw");
        } catch (e) {
            expect(e).toBeInstanceOf(DecompressionError);
            expect((e as DecompressionError).encoding).toBe("deflate");
        }
    });

    it("brotliDecompress of corrupt data tags the error with encoding 'br'", () => {
        const corrupt = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
        try {
            provider.brotliDecompress(corrupt);
            throw new Error("expected brotliDecompress to throw");
        } catch (e) {
            expect(e).toBeInstanceOf(DecompressionError);
            expect((e as DecompressionError).encoding).toBe("br");
            expect((e as DecompressionError).cause).toBeInstanceOf(Error);
        }
    });
});

describe("ensureCompressionError", () => {
    it("passes through an existing CompressionError unchanged (same reference)", () => {
        const original = new UnsupportedEncodingError("sdch");
        expect(ensureCompressionError(original, "sdch")).toBe(original);
    });

    it("passes through DecompressionError unchanged even under a different encoding tag", () => {
        // The pass-through is by type, not by encoding match — double-wrapping
        // never happens regardless of the encoding argument.
        const original = new DecompressionError("gzip");
        expect(ensureCompressionError(original, "br")).toBe(original);
    });

    it("wraps a plain Error as DecompressionError with the given encoding + cause", () => {
        const cause = new Error("boom");
        const wrapped = ensureCompressionError(cause, "gzip");
        expect(wrapped).toBeInstanceOf(DecompressionError);
        expect(wrapped.encoding).toBe("gzip");
        expect(wrapped.cause).toBe(cause);
    });

    it("wraps a non-Error value as DecompressionError with a synthetic Error cause", () => {
        const wrapped = ensureCompressionError("boom", "br");
        expect(wrapped).toBeInstanceOf(DecompressionError);
        expect(wrapped.encoding).toBe("br");
        expect(wrapped.cause).toBeInstanceOf(Error);
        expect((wrapped.cause as Error).message).toBe("boom");
    });

    it("wraps null as DecompressionError (cause is an 'unknown error' Error)", () => {
        const wrapped = ensureCompressionError(null, "gzip");
        expect(wrapped).toBeInstanceOf(DecompressionError);
        expect(wrapped.cause).toBeInstanceOf(Error);
        expect((wrapped.cause as Error).message).toBe("unknown error");
    });
});

describe("assertNever", () => {
    it("throws an Error containing the unexpected value", () => {
        // Cast: in correct usage the compiler guarantees `x` is `never`; here we
        // simulate the default branch receiving a value it should never see.
        try {
            assertNever("surprise" as never);
            throw new Error("expected assertNever to throw");
        } catch (e) {
            expect(e).toBeInstanceOf(Error);
            expect((e as Error).message).toContain("Unexpected value");
            expect((e as Error).message).toContain("surprise");
        }
    });

    it("JSON-stringifies the value in the message (objects are visible)", () => {
        try {
            assertNever({ a: 1 } as never);
            throw new Error("expected assertNever to throw");
        } catch (e) {
            expect((e as Error).message).toContain('{"a":1}');
        }
    });
});
