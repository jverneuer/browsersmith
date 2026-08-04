/**
 * Cookie jar integration + unit tests.
 *
 * Two layers are exercised here:
 *   1. The @browsercore/cookies public API (jar, parse, match, persistence) —
 *      the RFC 6265 logic the crawler relies on for session continuity.
 *   2. The re-export surface of `src/index.ts` — importing `createCookieJar`,
 *      `saveJar`, `loadJar` (and typed errors) from `../src/index.js` is what
 *      registers `index.ts` coverage, so every export is touched below.
 *
 * The jar logic lives in node_modules, but the *integration* (how crawl() and
 * consumers use it) is pure src-side behavior, and `index.ts` re-exports are
 * real statements that coverage counts.
 */

import { describe, it, expect, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import {
    createCookieJar,
    saveJar,
    loadJar,
    CookieDomainError,
    CookieParseError,
} from "../src/index.js";
import type { CookieJar, CookieUrl } from "../src/index.js";

/** A URL the jar can match against. */
function url(hostname: string, pathname = "/", protocol = "http:"): CookieUrl {
    return { hostname, pathname, protocol };
}

describe("cookie jar: parse + store", () => {
    it("parses a simple Set-Cookie and stores it", () => {
        const jar = createCookieJar();
        jar.setCookie("sid=abc123", url("example.com"));
        const cookies = jar.getCookies(url("example.com"));
        expect(cookies).toHaveLength(1);
        expect(cookies[0]?.name).toBe("sid");
        expect(cookies[0]?.value).toBe("abc123");
    });

    it("parses every standard attribute", () => {
        const jar = createCookieJar();
        const raw =
            "token=xyz; Domain=example.com; Path=/api; Secure; HttpOnly; " +
            "SameSite=Strict; Max-Age=3600; Partitioned";
        jar.setCookie(raw, url("www.example.com", "/api/v1"));
        // Secure cookie → must be fetched over https to match.
        const cookies = jar.getCookies(url("www.example.com", "/api/v1", "https:"));
        expect(cookies).toHaveLength(1);
        const c = cookies[0];
        expect(c?.name).toBe("token");
        expect(c?.value).toBe("xyz");
        expect(c?.domain).toBe("example.com");
        expect(c?.path).toBe("/api");
        expect(c?.secure).toBe(true);
        expect(c?.httpOnly).toBe(true);
        expect(c?.sameSite).toBe("Strict");
        expect(c?.maxAge).toBe(3600);
        expect(c?.partitioned).toBe(true);
        expect(c?.hostOnly).toBe(false);
    });

    it("defaults SameSite to Lax when omitted", () => {
        const jar = createCookieJar();
        jar.setCookie("a=1", url("example.com"));
        expect(jar.getCookies(url("example.com"))[0]?.sameSite).toBe("Lax");
    });

    it("treats an unknown attribute as ignored (does not throw)", () => {
        const jar = createCookieJar();
        expect(() => jar.setCookie("a=1; FooBar=baz", url("example.com"))).not.toThrow();
        expect(jar.getCookies(url("example.com"))[0]?.value).toBe("1");
    });

    it("throws CookieParseError on an empty header", () => {
        const jar = createCookieJar();
        expect(() => jar.setCookie("   ", url("example.com"))).toThrow(CookieParseError);
    });

    it("throws CookieParseError on a malformed name=value (no '=')", () => {
        const jar = createCookieJar();
        expect(() => jar.setCookie("bad", url("example.com"))).toThrow(CookieParseError);
    });

    it("throws CookieParseError on an invalid Expires date", () => {
        const jar = createCookieJar();
        expect(() => jar.setCookie("a=1; Expires=not-a-date", url("example.com"))).toThrow(
            CookieParseError,
        );
    });

    it("throws CookieParseError on a non-integer Max-Age", () => {
        const jar = createCookieJar();
        expect(() => jar.setCookie("a=1; Max-Age=abc", url("example.com"))).toThrow(CookieParseError);
    });

    it("throws CookieDomainError when the cookie domain mismatches (reject on)", () => {
        const jar = createCookieJar();
        expect(() => jar.setCookie("a=1; Domain=evil.com", url("example.com"))).toThrow(
            CookieDomainError,
        );
    });

    it("accepts a mismatched domain when rejectDomainMismatch is false", () => {
        const jar = createCookieJar({ rejectDomainMismatch: false });
        jar.setCookie("a=1; Domain=other.com", url("example.com"));
        // Stored under the cookie's own domain, not the request host.
        expect(jar.getCookies(url("other.com"))).toHaveLength(1);
        expect(jar.getCookies(url("example.com"))).toHaveLength(0);
    });
});

describe("cookie jar: URL matching", () => {
    it("does not return cookies for an unmatched domain", () => {
        const jar = createCookieJar();
        jar.setCookie("a=1", url("example.com"));
        expect(jar.getCookies(url("other.com"))).toHaveLength(0);
    });

    it("matches a non-hostOnly cookie to subdomains", () => {
        const jar = createCookieJar();
        jar.setCookie("a=1; Domain=example.com", url("www.example.com"));
        expect(jar.getCookies(url("www.example.com"))).toHaveLength(1);
        expect(jar.getCookies(url("deep.sub.example.com"))).toHaveLength(1);
        // hostOnly cookie set on exact host does NOT match subdomains
        jar.setCookie("b=2", url("example.com"));
        expect(jar.getCookies(url("sub.example.com"))).toHaveLength(1); // only `a`
    });

    it("a hostOnly cookie matches only its exact host", () => {
        const jar = createCookieJar();
        jar.setCookie("b=2", url("example.com"));
        expect(jar.getCookies(url("example.com"))).toHaveLength(1);
        expect(jar.getCookies(url("sub.example.com"))).toHaveLength(0);
    });

    it("matches by path prefix", () => {
        const jar = createCookieJar();
        jar.setCookie("a=1; Path=/api", url("example.com", "/api/v1"));
        expect(jar.getCookies(url("example.com", "/api/v1"))).toHaveLength(1);
        expect(jar.getCookies(url("example.com", "/api"))).toHaveLength(1);
        // /apiv should NOT match /api (the boundary must be '/')
        expect(jar.getCookies(url("example.com", "/apiv"))).toHaveLength(0);
        expect(jar.getCookies(url("example.com", "/other"))).toHaveLength(0);
    });

    it("a cookie whose path is the dir + trailing slash matches children", () => {
        const jar = createCookieJar();
        jar.setCookie("a=1; Path=/api/", url("example.com", "/api/v1"));
        expect(jar.getCookies(url("example.com", "/api/v1"))).toHaveLength(1);
        expect(jar.getCookies(url("example.com", "/api"))).toHaveLength(0);
    });

    it("does not send a Secure cookie over http", () => {
        const jar = createCookieJar();
        jar.setCookie("a=1; Secure", url("example.com"));
        expect(jar.getCookies(url("example.com", "/", "http:"))).toHaveLength(0);
        expect(jar.getCookies(url("example.com", "/", "https:"))).toHaveLength(1);
    });

    it("treats an expired (maxAge) cookie as not matching", () => {
        const jar = createCookieJar();
        jar.setCookie("a=1; Max-Age=0", url("example.com"));
        // maxAge=0 → creationTime + 0 <= now → expired immediately.
        expect(jar.getCookies(url("example.com"))).toHaveLength(0);
    });

    it("does not match when the SameSite=Strict cookie is cross-site", () => {
        const jar = createCookieJar();
        jar.setCookie("a=1; SameSite=Strict", url("example.com"));
        const crossSite = {
            topLevelSite: "evil.com",
            isTopLevelNavigation: true,
            method: "GET",
        };
        expect(jar.getCookies(url("example.com"), crossSite)).toHaveLength(0);
    });

    it("SameSite=Lax allows a safe top-level cross-site navigation", () => {
        const jar = createCookieJar();
        jar.setCookie("a=1; SameSite=Lax", url("example.com"));
        const safeTop = { topLevelSite: "evil.com", isTopLevelNavigation: true, method: "GET" };
        expect(jar.getCookies(url("example.com"), safeTop)).toHaveLength(1);
        // But a cross-site POST (unsafe) is blocked.
        const unsafeTop = { topLevelSite: "evil.com", isTopLevelNavigation: true, method: "POST" };
        expect(jar.getCookies(url("example.com"), unsafeTop)).toHaveLength(0);
    });

    it("SameSite=None always allows (Secure-ness enforced separately)", () => {
        const jar = createCookieJar();
        jar.setCookie("a=1; SameSite=None; Secure", url("example.com"));
        const crossSite = { topLevelSite: "evil.com", isTopLevelNavigation: true, method: "POST" };
        expect(jar.getCookies(url("example.com", "/", "https:"), crossSite)).toHaveLength(1);
    });

    it("sorts results per RFC 6265 §5.4: longer path first", () => {
        const jar = createCookieJar();
        jar.setCookie("short=1; Path=/", url("example.com"));
        jar.setCookie("long=1; Path=/a/b/c", url("example.com", "/a/b/c"));
        const names = jar.getCookies(url("example.com", "/a/b/c")).map((c) => c.name);
        expect(names.indexOf("long")).toBeLessThan(names.indexOf("short"));
    });
});

describe("cookie jar: mutate", () => {
    it("removeCookie deletes a single cookie by name+domain+path", () => {
        const jar = createCookieJar();
        jar.setCookie("a=1", url("example.com"));
        jar.setCookie("b=2", url("example.com"));
        jar.removeCookie("a", "example.com", "/");
        const names = jar.getCookies(url("example.com")).map((c) => c.name);
        expect(names).toEqual(["b"]);
    });

    it("clear empties the jar", () => {
        const jar = createCookieJar();
        jar.setCookie("a=1", url("example.com"));
        jar.setCookie("b=2", url("example.com"));
        jar.clear();
        expect(jar.getCookies(url("example.com"))).toHaveLength(0);
    });

    it("overwrites a cookie with the same name+domain+path", () => {
        const jar = createCookieJar();
        jar.setCookie("a=1", url("example.com"));
        jar.setCookie("a=2", url("example.com"));
        const cookies = jar.getCookies(url("example.com"));
        expect(cookies).toHaveLength(1);
        expect(cookies[0]?.value).toBe("2");
    });
});

describe("cookie jar: persistence (saveJar / loadJar)", () => {
    let dir: string;
    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it("round-trips a jar through disk", async () => {
        dir = mkdtempSync(join(tmpdir(), "cookie-jar-"));
        const path = join(dir, "jar.json");

        const jar = createCookieJar();
        jar.setCookie("sid=abc123; Path=/; Secure", url("example.com"));
        jar.setCookie("lang=en; Path=/settings", url("example.com", "/settings"));
        await saveJar(jar, path);

        const loaded = await loadJar(path);
        // sid is Secure → only matches over https; lang matches over http.
        expect(loaded.getCookies(url("example.com", "/", "https:"))).toHaveLength(1);
        expect(loaded.getCookies(url("example.com", "/settings", "https:"))).toHaveLength(2);
        expect(loaded.getCookies(url("example.com", "/", "https:"))[0]?.value).toBe("abc123");
    });

    it("serialize → deserialize round-trips in memory", () => {
        const jar = createCookieJar();
        jar.setCookie("a=1; Domain=example.com", url("www.example.com"));
        const json = jar.serialize();

        const restored: CookieJar = createCookieJar();
        restored.deserialize(json);
        expect(restored.getCookies(url("www.example.com"))).toHaveLength(1);
    });
});
