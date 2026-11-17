/**
 * Unit tests for the Node.js TCP adapter (`src/platform/network/node/net.ts`).
 *
 * `nodeNet` wraps `node:net.connect` so it satisfies the platform-agnostic
 * `@browsercore/contracts` Net interface. We mock `node:net` to avoid real
 * network calls and verify that:
 *   - connect() delegates to node:net.connect with the mapped options
 *   - the returned socket satisfies the Socket interface contract
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Socket as NodeSocket } from "node:net";

/**
 * The single `node:net.connect` call shape the adapter exercises: options
 * object in, socket out. Declared so the mock's recorded calls and return
 * values are fully typed (node:net's connect is overloaded).
 */
type NetConnectMock = (options: {
    readonly host: string;
    readonly port: number;
    readonly noDelay?: boolean;
    readonly localAddress?: string;
    readonly family?: number;
}) => NodeSocket;

// vi.hoisted runs before vi.mock's hoisted factory executes, so the mock is
// initialized when the factory dereferences it (a plain const would be TDZ).
const { mockNetConnect } = vi.hoisted(() => ({
    mockNetConnect: vi.fn<NetConnectMock>(() => {
        throw new Error("node:net.connect mock not configured for this test");
    }),
}));

vi.mock("node:net", () => ({
    connect: mockNetConnect,
}));

import { nodeNet } from "../src/platform/network/node/index.js";
import type { Socket, ConnectOptions } from "@browsercore/contracts";

/**
 * Minimal fake socket covering the members nodeNet passes through and the
 * tests assert on. The one `as unknown as NodeSocket` below (third-party
 * boundary) is justified: node:net's Socket surface is far larger than the
 * contracts slice this adapter relays, and the mock replaces it wholesale.
 */
function createFakeSocket() {
    return {
        write: vi.fn((_data: Uint8Array, _cb?: (err?: Error | null) => void): boolean => true),
        end: vi.fn((): void => {}),
        destroy: vi.fn((_error?: Error): void => {}),
        destroyed: false,
        once: vi.fn((_event: "connect" | "close" | "error", _listener: () => void): void => {}),
        on: vi.fn((_event: string, _listener: (...args: unknown[]) => void): void => {}),
    };
}

describe("nodeNet adapter", () => {
    beforeEach(() => {
        mockNetConnect.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("delegates to node:net.connect with mapped options", () => {
        const fakeSocket = createFakeSocket();
        mockNetConnect.mockReturnValueOnce(fakeSocket as unknown as NodeSocket);

        const options: ConnectOptions = {
            host: "example.com",
            port: 443,
            noDelay: true,
            localAddress: "192.168.1.100",
            family: 4,
        };

        const result = nodeNet.connect(options);

        expect(mockNetConnect).toHaveBeenCalledWith({
            host: "example.com",
            port: 443,
            noDelay: true,
            localAddress: "192.168.1.100",
            family: 4,
        });
        expect(result).toBe(fakeSocket);
    });

    it("maps all ConnectOptions fields correctly (including optional ones)", () => {
        const fakeSocket = createFakeSocket();
        mockNetConnect.mockReturnValueOnce(fakeSocket as unknown as NodeSocket);

        const options: ConnectOptions = {
            host: "api.example.com",
            port: 8080,
        };

        const result = nodeNet.connect(options);

        expect(mockNetConnect).toHaveBeenCalledWith({
            host: "api.example.com",
            port: 8080,
            noDelay: undefined,
            localAddress: undefined,
            family: undefined,
        });
        expect(result).toBe(fakeSocket);
    });

    it("returns a socket that satisfies the Socket interface", () => {
        const fakeSocket = createFakeSocket();
        mockNetConnect.mockReturnValueOnce(fakeSocket as unknown as NodeSocket);

        const options: ConnectOptions = {
            host: "example.com",
            port: 443,
        };

        const socket: Socket = nodeNet.connect(options);

        // Verify the socket has the required methods per the Socket contract.
        expect(typeof socket.write).toBe("function");
        expect(typeof socket.end).toBe("function");
        expect(typeof socket.destroy).toBe("function");
        expect(typeof socket.once).toBe("function");
        expect(typeof socket.on).toBe("function");
        expect(socket.destroyed).toBe(false);
    });

    it("passes options through without mutation", () => {
        const fakeSocket = createFakeSocket();
        mockNetConnect.mockReturnValueOnce(fakeSocket as unknown as NodeSocket);

        const options: ConnectOptions = {
            host: "example.com",
            port: 443,
            noDelay: true,
            family: 6,
        };

        // Capture the original options for comparison.
        const originalOptions = { ...options };

        nodeNet.connect(options);

        // The original options object should not be mutated.
        expect(options).toEqual(originalOptions);
    });

    it("handles IPv6 family option", () => {
        const fakeSocket = createFakeSocket();
        mockNetConnect.mockReturnValueOnce(fakeSocket as unknown as NodeSocket);

        const options: ConnectOptions = {
            host: "ipv6.example.com",
            port: 443,
            family: 6,
        };

        const result = nodeNet.connect(options);

        expect(mockNetConnect).toHaveBeenCalledWith(
            expect.objectContaining({ family: 6 }),
        );
        expect(result).toBe(fakeSocket);
    });
});
