/**
 * Typed errors for @browsercore/profiles.
 *
 * Errors are part of the API — callers match on `kind` instead of parsing messages.
 */

/** Base class for all profile lookup / registration failures. */
export class ProfileError extends Error {
    public readonly kind: string;
    public override readonly cause: Error | undefined;

    constructor(
        kind: string,
        message: string,
        options?: { cause?: Error },
    ) {
        super(message, options);
        this.name = new.target.name;
        this.kind = kind;
        this.cause = options?.cause;
    }
}

/** No profile exists for the requested {@link ProfileId}. */
export class UnknownProfileError extends ProfileError {
    public override readonly kind = "UnknownProfileError" as const;
    public readonly profileId: string;

    constructor(profileId: string) {
        super("UnknownProfileError", `Unknown browser profile: ${profileId}`);
        this.name = "UnknownProfileError";
        this.profileId = profileId;
    }
}
