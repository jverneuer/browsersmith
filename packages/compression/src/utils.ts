/**
 * Small shared helpers for @browsercore/compression.
 */

/**
 * Exhaustiveness check for discriminated unions. Use as the `default` branch
 * of a `switch` so adding a new case forces every handler to compile-error
 * until handled.
 */
export function assertNever(x: never): never {
    throw new Error(`Unexpected value: ${JSON.stringify(x)}`);
}
