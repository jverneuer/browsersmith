/**
 * Tests for `createTlsHandshakeEngine` (`src/wiring.ts`).
 *
 * The helper wraps `@browsercore/tls`'s three exported engine functions into
 * the contracts `TlsHandshakeEngine` interface — the injection seam that
 * completes replaceability-audit item #2 (quic consumes the interface, never
 * the tls package directly). These tests pin that the wrapper is a verbatim
 * pass-through: same function references, same behavior — no adaptation.
 */

import { describe, expect, it } from "vitest";
import * as tls from "@browsercore/tls";
import { createTlsHandshakeEngine, defaultTlsHandshakeEngine } from "../src/wiring.js";

describe("createTlsHandshakeEngine", () => {
    it("wraps @browsercore/tls's engine functions by reference (no adaptation)", () => {
        const engine = createTlsHandshakeEngine();
        expect(engine.runHandshake).toBe(tls.runHandshake);
        expect(engine.generateKeyShares).toBe(tls.generateKeyShares);
        expect(engine.cipherSuiteToAead).toBe(tls.cipherSuiteToAead);
    });

    it("exposes the full contracts TlsHandshakeEngine surface", () => {
        const engine = createTlsHandshakeEngine();
        expect(typeof engine.runHandshake).toBe("function");
        expect(typeof engine.generateKeyShares).toBe("function");
        expect(typeof engine.cipherSuiteToAead).toBe("function");
    });

    it("cipherSuiteToAead delegates to the tls mapping", () => {
        const engine = createTlsHandshakeEngine();
        expect(engine.cipherSuiteToAead("TLS_AES_128_GCM_SHA256")).toBe("AES-128-GCM");
        expect(engine.cipherSuiteToAead("TLS_AES_256_GCM_SHA384")).toBe("AES-256-GCM");
        expect(engine.cipherSuiteToAead("TLS_CHACHA20_POLY1305_SHA256")).toBe("CHACHA20-POLY1305");
    });

    it("returns a fresh engine per call (callers may own their instance)", () => {
        expect(createTlsHandshakeEngine()).not.toBe(createTlsHandshakeEngine());
    });

    it("defaultTlsHandshakeEngine is memoized (one shared stateless instance)", () => {
        expect(defaultTlsHandshakeEngine()).toBe(defaultTlsHandshakeEngine());
    });
});
