/**
 * Tests for the `String(err)` fallback in crawl()'s non-HTTP/3 catch block.
 *
 * The fetch client (@browsercore/fetch) always wraps caught values in a
 * `FetchError` (which extends `Error`) before re-throwing — so under normal
 * operation the `err instanceof Error` branch is always taken and the
 * `String(err)` fallback at line 279 of src/crawl.ts is never reached through
 * the real client. To exercise that branch directly, we mock
 * `@browsercore/fetch` so that `createClient` returns a client whose `fetch`
 * method throws a non-Error value (a number). This proves the defensive
 * `String(err)` path works even if a future client stops wrapping.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @browsercore/fetch: createClient returns a client whose fetch() throws
// a non-Error value (a number). This forces the `String(err)` branch in
// crawl()'s catch block — a branch the real fetch client never exercises
// because it always wraps errors in FetchError (which extends Error).
vi.mock(import("@browsercore/fetch"), async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        createClient: vi.fn(() => ({
            fetch: vi.fn(async (): Promise<never> => {
                // Throw a non-Error value to exercise the String(err) branch.
                throw 42;
            }),
            close: vi.fn(async () => {}),
        })),
    };
});

import { crawl } from "../src/crawl.js";

describe("crawl() — non-Error rejection in catch block", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("stringifies a non-Error rejection via String(err) fallback", async () => {
        // With the mocked fetch client throwing a number (42), the catch
        // block's `err instanceof Error` check fails and `String(err)` is
        // used — producing "42".
        const [r] = await crawl(["https://example.com/"]);
        expect(r.ok).toBe(false);
        expect(r.error).toBe("42");
    });

    it("stringifies a non-Error string rejection via String(err) fallback", async () => {
        // Re-mock to throw a plain string (not an Error) — String(err)
        // returns the string itself.
        const { createClient } = await import("@browsercore/fetch");
        vi.mocked(createClient).mockReturnValue({
            fetch: vi.fn(async (): Promise<never> => {
                throw "raw-string-from-fetch";
            }),
            close: vi.fn(async () => {}),
        });

        const [r] = await crawl(["https://example.com/"]);
        expect(r.ok).toBe(false);
        expect(r.error).toBe("raw-string-from-fetch");
    });
});
