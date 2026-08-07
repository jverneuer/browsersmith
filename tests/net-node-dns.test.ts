/**
 * Unit tests for the Node.js DNS adapter (`src/net/node/dns.ts`).
 *
 * `nodeDns` wraps `node:dns.lookup` (callback-style) into the Promise-based
 * `@browsercore/contracts` DnsResolver interface. We mock `node:dns` to avoid
 * real network calls and exercise both the success path (resolve with an
 * IPAddress) and the error path (reject with the lookup error).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock node:dns before importing the adapter so the mock is in place.
vi.mock("node:dns", () => ({
    lookup: vi.fn(),
}));

import { lookup as dnsLookup } from "node:dns";
import { nodeDns } from "../../src/net/node/index.js";
import type { IPAddress } from "@browsercore/contracts";

const mockedLookup = vi.mocked(dnsLookup);

describe("nodeDns adapter", () => {
    beforeEach(() => {
        mockedLookup.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("resolves a hostname to an IPAddress on successful lookup (IPv4)", async () => {
        // node:dns.lookup calls back with (null, address, family).
        mockedLookup.mockImplementationOnce(
            (_hostname, _options, cb) => {
                cb(null, "93.184.216.34", 4);
            },
        );

        const result = await nodeDns.lookup("example.com", 4);

        expect(result).toHaveLength(1);
        const addr = result[0] as IPAddress;
        expect(addr.address).toBe("93.184.216.34");
        expect(addr.family).toBe(4);
        expect(mockedLookup).toHaveBeenCalledWith(
            "example.com",
            { family: 4 },
            expect.any(Function),
        );
    });

    it("resolves a hostname to an IPAddress on successful lookup (IPv6)", async () => {
        mockedLookup.mockImplementationOnce(
            (_hostname, _options, cb) => {
                cb(null, "2606:2800:220:1:248:1893:25c8:1946", 6);
            },
        );

        const result = await nodeDns.lookup("example.com", 6);

        expect(result).toHaveLength(1);
        const addr = result[0] as IPAddress;
        expect(addr.address).toBe("2606:2800:220:1:248:1893:25c8:1946");
        expect(addr.family).toBe(6);
    });

    it("falls back to the requested family when the lookup omits resolvedFamily", async () => {
        // Some Node versions may pass `undefined` for family in the callback.
        // The adapter must fall back to the `family` argument it was called with.
        mockedLookup.mockImplementationOnce(
            (_hostname, _options, cb) => {
                cb(null, "127.0.0.1", undefined as unknown as 4);
            },
        );

        const result = await nodeDns.lookup("localhost", 4);

        expect(result).toHaveLength(1);
        const addr = result[0] as IPAddress;
        expect(addr.address).toBe("127.0.0.1");
        expect(addr.family).toBe(4);
    });

    it("rejects with the lookup error when node:dns.lookup fails", async () => {
        const dnsError = new Error("ENOTFOUND");
        mockedLookup.mockImplementationOnce(
            (_hostname, _options, cb) => {
                cb(dnsError, "", 0 as unknown as 4);
            },
        );

        await expect(nodeDns.lookup("nonexistent.invalid", 4)).rejects.toThrow("ENOTFOUND");
    });

    it("returns an array with exactly one result (single-address contract)", async () => {
        mockedLookup.mockImplementationOnce(
            (_hostname, _options, cb) => {
                cb(null, "192.0.2.1", 4);
            },
        );

        const result = await nodeDns.lookup("single.example", 4);

        // The contract returns readonly IPAddress[]; verify it's an array.
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(1);
    });
});
