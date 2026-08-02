/**
 * Typed errors for @network/crypto.
 *
 * Errors are part of the API — every failure mode is an explicit type so callers
 * can match on `kind` instead of parsing messages.
 */

import { assertNever } from "./utils.js";

/** Base class for all crypto errors. Carries the algorithm that failed, if known. */
export class CryptoError extends Error {
    public readonly kind = "CryptoError" as const;
    /** Algorithm identifier that triggered the error, when applicable. */
    public readonly algorithm: string | undefined;
    /** `Error | undefined` (not `?`) so assignment is valid under exactOptionalPropertyTypes. */
    public override readonly cause: Error | undefined;

    constructor(
        message: string,
        algorithm?: string,
        options?: { cause?: Error },
    ) {
        super(message, options);
        this.name = new.target.name;
        this.algorithm = algorithm;
        this.cause = options?.cause;
    }
}

/** The requested algorithm is not supported by this provider. */
export class UnsupportedAlgorithmError extends Error {
    public readonly kind = "UnsupportedAlgorithmError" as const;
    public readonly algorithm: string;

    constructor(algorithm: string) {
        super(`Unsupported crypto algorithm: ${algorithm}`);
        this.name = "UnsupportedAlgorithmError";
        this.algorithm = algorithm;
    }
}

/** Decryption failed — authentication tag mismatch or corrupt input. */
export class DecryptError extends Error {
    public readonly kind = "DecryptError" as const;
    public readonly algorithm: string;
    /** `Error | undefined` (not `?`) so assignment is valid under exactOptionalPropertyTypes. */
    public override readonly cause: Error | undefined;

    constructor(algorithm: string, options?: { cause?: Error }) {
        super(`Decryption failed for ${algorithm}: authentication mismatch or corrupt input`);
        this.name = "DecryptError";
        this.algorithm = algorithm;
        this.cause = options?.cause;
    }
}

/** Narrow a caught error to a typed crypto error, or wrap it in CryptoError. */
export function ensureCryptoError(e: unknown, algorithm?: string): CryptoError {
    if (e instanceof CryptoError) {
        return e;
    }
    if (e instanceof Error) {
        return new CryptoError(e.message, algorithm, { cause: e });
    }
    return new CryptoError(typeof e === "string" ? e : "unknown crypto error", algorithm);
}

void assertNever; // referenced for tree-shaking safety in bundlers
