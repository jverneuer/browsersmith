/**
 * Small shared helpers for @network/profiles.
 *
 * Kept dependency-free so every package can copy the pattern without pulling in
 * cross-package imports.
 */

/**
 * Exhaustiveness check for `switch`/`if-else` over discriminated unions.
 * Call in the `default` branch: `default: assertNever(x)`.
 * Adding a new union member forces every handler to compile-error until handled.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function assertNever(x: never): never {
    throw new Error(`Unexpected value: ${JSON.stringify(x)}`);
}

/**
 * Build a branded {@link ProfileId} from a browser name + version.
 * Format: `${name}-${version}`, e.g. "chrome-140".
 */
export function createId(name: string, version: string): string {
    return `${name}-${version}`;
}
