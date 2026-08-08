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

// Mock node:net before importing the adapter so the mock is in place.
vi.mock("node:net", () => ({
    connect: vi.fn(),
}));

import { connect as netConnect } from "node:net";
import { nodeNet } from "../../src/platform/network/node/index.js";
import type { Socket, ConnectOptions } from "@browsercore/contracts";

const mockedConnect = vi.mocked(netConnect);

/** Minimal fake socket that satisfies the @browsercore/contracts Socket interface. */
function createFakeSocket(): Socket {
    return {
        write: vi.fn<["write"]>().mockReturnValue(true),
        end: vi.fn<["end"]>(),
        destroy: vi.fn<["destroy"]>(),
        destroyed: false,
        once: vi.fn<["once"]>(),
        on: vi.fn<["on"]>(),
    } as unknown as Socket;
}

describe("nodeNet adapter", () => {
    beforeEach(() => {
        mockedConnect.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("delegates to node:net.connect with mapped options", () => {
        const fakeSocket = createFakeSocket();
        mockedConnect.mockReturnValueOnce(fakeSocket as unknown as ReturnType<typeof netConnect>);

        const options: ConnectOptions = {
            host: "example.com",
            port: 443,
            noDelay: true,
            localAddress: "192.168.1.100",
            family: 4,
        };

        const result = nodeNet.connect(options);

        expect(mockedConnect).toHaveBeenCalledWith({
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
        mockedConnect.mockReturnValueOnce(fakeSocket as unknown as ReturnType<typeof netConnect>);

        const options: ConnectOptions = {
            host: "api.example.com",
            port: 8080,
        };

        const result = nodeNet.connect(options);

        expect(mockedConnect).toHaveBeenCalledWith({
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
        mockedConnect.mockReturnValueOnce(fakeSocket as unknown as ReturnType<typeof netConnect>);

        const options: ConnectOptions = {
            host: "example.com",
            port: 443,
        };

        const socket = nodeNet.connect(options);

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
        mockedConnect.mockReturnValueOnce(fakeSocket as unknown as ReturnType<typeof netConnect>);

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
        mockedConnect.mockReturnValueOnce(fakeSocket as unknown as ReturnType<typeof netConnect>);

        const options: ConnectOptions = {
            host: "ipv6.example.com",
            port: 443,
            family: 6,
        };

        const result = nodeNet.connect(options);

        expect(mockedConnect).toHaveBeenCalledWith(
            expect.objectContaining({ family: 6 }),
        );
        expect(result).toBe(fakeSocket);
    });
});
