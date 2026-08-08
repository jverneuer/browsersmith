/**
 * Tests for the uncovered error/close paths of the nodeUdp adapter
 * (src/platform/network/node/udp.ts).
 *
 * The happy-path tests live in adapters.test.ts against the real socket
 * singleton. This file covers the paths those tests deliberately avoid:
 *   - send() rejecting when the underlying socket reports an error
 *   - recv() rejecting when the socket emits "error" instead of "message"
 *   - close() resolving when the OS socket closes
 *
 * Strategy: mock `node:dgram` so we control the socket the adapter wraps.
 * This lets us emit arbitrary events (message, error) and capture the
 * send callback — exercising every branch of the adapter without depending
 * on real OS socket behavior.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mock references — must be initialized before the vi.mock factory
// (which Vitest hoists to the top of the file).
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
    mockSend: vi.fn(),
    mockClose: vi.fn(),
    mockOn: vi.fn(),
    mockOnce: vi.fn(),
    mockOff: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock node:dgram before importing the adapter (vi.mock is hoisted).
// ---------------------------------------------------------------------------

vi.mock("node:dgram", () => ({
    createSocket: () => ({
        on: mocks.mockOn,
        once: mocks.mockOnce,
        off: mocks.mockOff,
        emit: vi.fn(),
        send: mocks.mockSend,
        close: mocks.mockClose,
    }),
}));

import { nodeUdp } from "../../../../src/platform/network/node/udp.js";

beforeEach(() => {
    mocks.mockSend.mockReset();
    mocks.mockClose.mockReset();
    mocks.mockOn.mockReset();
    mocks.mockOnce.mockReset();
    mocks.mockOff.mockReset();
});

describe("nodeUdp adapter — error and close paths (mocked socket)", () => {
    it("send() rejects when the underlying socket reports a send error", async () => {
        // Capture the callback passed to socket.send() and invoke it with an
        // error — exercises the `reject(err)` branch in send().
        let sendCallback: ((err?: Error | null) => void) | undefined;
        mocks.mockSend.mockImplementation((_data: Uint8Array, _port: number, _addr: string, cb: (err?: Error | null) => void) => {
            sendCallback = cb;
        });

        const promise = nodeUdp.send(new Uint8Array([0x01]), {
            address: "127.0.0.1",
            port: 9999,
            family: 4,
        });

        // Fire the error callback asynchronously (mirrors real socket behavior).
        expect(sendCallback).toBeDefined();
        sendCallback!(new Error("send failed"));

        await expect(promise).rejects.toThrow("send failed");
    });

    it("recv() rejects when the socket emits an error while awaiting a datagram", async () => {
        // Capture the "error" listener registered by recv()'s socket.once("error", ...).
        let errorListener: ((err: Error) => void) | undefined;
        mocks.mockOnce.mockImplementation((event: string, listener: (...args: unknown[]) => void) => {
            if (event === "error") {
                errorListener = listener as (err: Error) => void;
            }
        });

        const promise = nodeUdp.recv();

        // The adapter should have registered an error listener.
        expect(errorListener).toBeDefined();
        errorListener!(new Error("socket error"));

        await expect(promise).rejects.toThrow("socket error");
    });

    it("close() resolves when the underlying socket closes", async () => {
        let closeCallback: (() => void) | undefined;
        mocks.mockClose.mockImplementation((cb: () => void) => {
            closeCallback = cb;
        });

        const promise = nodeUdp.close();

        expect(closeCallback).toBeDefined();
        closeCallback!();

        await expect(promise).resolves.toBeUndefined();
    });
});
