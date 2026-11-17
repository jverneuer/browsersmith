/**
 * The impersonation default on the browsersmith entry.
 *
 * Raw @browsercore/fetch is opt-in; browsersmith flips that. The wrapper is
 * tested against a mocked stack client so these assertions pin exactly what
 * we hand to @browsercore/fetch: chrome-140 when nothing is picked, the
 * picked profile when one is, and NO profile key at all for "none" (an
 * explicit `profile: undefined` is forbidden under exactOptionalPropertyTypes).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type {
    FetchClient,
    FetchClientOptions,
    FetchOptions,
    FetchResponse,
} from "@browsercore/fetch";
import type { Platform } from "../src/platform/index.js";

// Mocks carry the REAL @browsercore/fetch signatures they stand in for, so
// `mock.calls` entries expose their argument types to the assertions below.
// Neither mock needs an implementation: no test consumes a return value —
// they only pin the arguments browsersmith hands to the stack.
const mocks = vi.hoisted(() => ({
    stackCreateClient: vi.fn<(options?: FetchClientOptions) => FetchClient>(),
    stackFetch: vi.fn<
        (input: string, options?: FetchOptions, platform?: Platform) => Promise<FetchResponse>
    >(),
}));

vi.mock("@browsercore/fetch", () => ({
    createClient: mocks.stackCreateClient,
    fetch: mocks.stackFetch,
}));

import {
    createClient,
    fetch,
    resolveProfile,
    DEFAULT_PROFILE,
    NO_IMPERSONATION,
} from "../src/client.js";
import { fetch as stackFetch } from "@browsercore/fetch";
import { platform } from "../src/wiring.js";

beforeEach(() => {
    mocks.stackCreateClient.mockClear();
    mocks.stackFetch.mockClear();
});

describe("resolveProfile", () => {
    it("defaults to chrome-140", () => {
        expect(resolveProfile()).toBe("chrome-140");
        expect(DEFAULT_PROFILE).toBe("chrome-140");
    });

    it("passes a picked profile through", () => {
        expect(resolveProfile("firefox-128")).toBe("firefox-128");
    });

    it("maps the none sentinel to undefined (no impersonation)", () => {
        expect(resolveProfile("none")).toBeUndefined();
        expect(NO_IMPERSONATION).toBe("none");
    });
});

describe("createClient default", () => {
    it("injects chrome-140 when no profile is given", () => {
        createClient();
        expect(mocks.stackCreateClient).toHaveBeenCalledTimes(1);
        const init = mocks.stackCreateClient.mock.calls[0]![0]!;
        expect(init.profile).toBe("chrome-140");
    });

    it("honors a picked profile", () => {
        createClient({ profile: "firefox-128" });
        expect(mocks.stackCreateClient.mock.calls[0]![0]!.profile).toBe("firefox-128");
    });

    it("omits the profile key entirely for \"none\"", () => {
        createClient({ profile: "none" });
        const init = mocks.stackCreateClient.mock.calls[0]![0]!;
        expect("profile" in init).toBe(false);
    });

    it("forwards the rest of the options untouched", () => {
        const jar = { getCookies: () => [] } as unknown as never;
        createClient({ cookieJar: jar, timeoutMs: 1234 });
        const init = mocks.stackCreateClient.mock.calls[0]![0]!;
        expect(init.cookieJar).toBe(jar);
        expect(init.timeoutMs).toBe(1234);
    });
});

describe("one-shot fetch default", () => {
    it("injects chrome-140 and the wiring platform", () => {
        fetch("https://example.com/");
        expect(stackFetch).toHaveBeenCalledTimes(1);
        const [url, opts, plat] = mocks.stackFetch.mock.calls[0]!;
        expect(url).toBe("https://example.com/");
        expect(opts!.profile).toBe("chrome-140");
        expect(plat).toBe(platform);
    });

    it("drops the profile for \"none\"", async () => {
        await fetch("https://example.com/", { profile: "none" });
        const opts = mocks.stackFetch.mock.calls[0]![1]!;
        expect("profile" in opts).toBe(false);
    });
});
