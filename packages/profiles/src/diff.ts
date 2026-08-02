/**
 * Profile diff utility.
 *
 * Walks two {@link BrowserProfile} objects field-by-field and reports every
 * differing path. This is how we detect fingerprint drift between two profile
 * versions, or between a profile and a real capture.
 *
 * Array comparison is order-sensitive by default — cipher suite order is itself
 * a fingerprint signal, so reordering must surface as a diff.
 */

import type { BrowserProfile } from "./types.js";

/** Options controlling how profiles are compared. */
export interface DiffOptions {
    /**
     * When true (the default), arrays are compared element-by-element in order.
     * When false, arrays are compared as multisets (order is ignored).
     */
    readonly compareArrayOrder?: boolean;
}

/** A single difference between two profiles, located by its dotted path. */
export interface ProfileDiff {
    /** Dotted path to the differing field, e.g. "tls.cipherSuites[3]". */
    readonly path: string;
    /** Value in the left-hand profile. */
    readonly a: unknown;
    /** Value in the right-hand profile. */
    readonly b: unknown;
}

/** A structural value that can be recursively diffed. */
type DiffNode =
    | { readonly [key: string]: DiffNode }
    | readonly DiffNode[]
    | string
    | number
    | boolean
    | null
    | undefined;

/** Narrow `unknown` to a structural object without relying on `Array.isArray`'s `any` narrowing. */
function isObject(x: unknown): x is { readonly [key: string]: DiffNode } {
    return typeof x === "object" && x !== null;
}

/** Narrow `unknown` to an array with a typed predicate (avoids `Array.isArray` → `any[]`). */
function isArray(x: unknown): x is readonly DiffNode[] {
    return Array.isArray(x);
}

/** Append a single diff. */
function emit(out: ProfileDiff[], path: string, a: unknown, b: unknown): void {
    out.push({ path, a, b });
}

/** Sorted union of own-property keys from both objects, for deterministic output. */
function unionKeys(
    a: { readonly [key: string]: unknown },
    b: { readonly [key: string]: unknown },
): string[] {
    const keys = new Set<string>();
    for (const k of Object.keys(a)) keys.add(k);
    for (const k of Object.keys(b)) keys.add(k);
    return Array.from(keys).sort();
}

/**
 * Recursively diff two structural values, appending results to `out`.
 * Reference equality (`===`) short-circuits identical subtrees.
 */
function walk(
    path: string,
    a: unknown,
    b: unknown,
    options: DiffOptions,
    out: ProfileDiff[],
): void {
    if (a === b) return;

    const aArr = isArray(a);
    const bArr = isArray(b);

    if (aArr && bArr) {
        walkArray(path, a, b, options, out);
        return;
    }
    // One is an array and the other is not — incomparable at this path.
    if (aArr || bArr) {
        emit(out, path, a, b);
        return;
    }

    if (isObject(a) && isObject(b)) {
        for (const key of unionKeys(a, b)) {
            const childPath = path === "" ? key : `${path}.${key}`;
            const aHas = Object.prototype.hasOwnProperty.call(a, key);
            const bHas = Object.prototype.hasOwnProperty.call(b, key);
            if (aHas && bHas) {
                walk(childPath, a[key], b[key], options, out);
            } else if (aHas) {
                emit(out, childPath, a[key], undefined);
            } else {
                emit(out, childPath, undefined, b[key]);
            }
        }
        return;
    }

    // Primitives (or type mismatches) that are not `===`.
    emit(out, path, a, b);
}

/**
 * Diff two arrays. In ordered mode (default) compares element-by-element so
 * reordering is reported. In unordered mode compares as multisets.
 */
function walkArray(
    path: string,
    a: readonly DiffNode[],
    b: readonly DiffNode[],
    options: DiffOptions,
    out: ProfileDiff[],
): void {
    if (options.compareArrayOrder ?? true) {
        const max = Math.max(a.length, b.length);
        for (let i = 0; i < max; i++) {
            const childPath = `${path}[${i}]`;
            const aHas = i < a.length;
            const bHas = i < b.length;
            if (aHas && bHas) {
                walk(childPath, a[i], b[i], options, out);
            } else if (aHas) {
                emit(out, childPath, a[i], undefined);
            } else {
                emit(out, childPath, undefined, b[i]);
            }
        }
        return;
    }

    // Unordered: compare as multisets of serialized keys. A single whole-array
    // diff is reported when membership differs.
    const sortKey = (v: unknown): string =>
        isObject(v) || isArray(v) ? stableStringify(v) : String(v);

    const sortedA = a.map(sortKey).sort();
    const sortedB = b.map(sortKey).sort();

    let equal = sortedA.length === sortedB.length;
    if (equal) {
        for (let i = 0; i < sortedA.length; i++) {
            if (sortedA[i] !== sortedB[i]) {
                equal = false;
                break;
            }
        }
    }
    if (!equal) {
        emit(out, path, a, b);
    }
}

/** Stable JSON.stringify using sorted object keys, for deterministic multiset comparison. */
function stableStringify(value: unknown): string {
    return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
    if (isArray(value)) {
        return value.map(sortValue);
    }
    if (isObject(value)) {
        const sorted: Record<string, unknown> = {};
        for (const key of Object.keys(value).sort()) {
            sorted[key] = sortValue(value[key]);
        }
        return sorted;
    }
    return value;
}

/**
 * Deep, field-by-field diff of two browser profiles.
 *
 * Returns a {@link ProfileDiff} for every differing path. The result is empty
 * when the profiles are structurally equal. Array comparison is order-sensitive
 * by default; pass `{ compareArrayOrder: false }` to ignore element order.
 */
export function diffProfiles(
    a: BrowserProfile,
    b: BrowserProfile,
    options: DiffOptions = {},
): ProfileDiff[] {
    const out: ProfileDiff[] = [];
    walk("", a as unknown as DiffNode, b as unknown as DiffNode, options, out);
    return out;
}
