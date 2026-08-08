/**
 * Tests for {@link NodeEventProvider}.
 *
 * Verifies that the Node.js EventProvider adapter correctly delegates to the
 * underlying Node EventEmitter for registration, emission, and removal.
 */

import { describe, it, expect, vi } from "vitest";
import { NodeEventProvider } from "../../../../src/platform/events/node/event-provider.js";

describe("NodeEventProvider", () => {
    describe("on", () => {
        it("registers a listener that is invoked on emit", () => {
            const provider = new NodeEventProvider();
            const listener = vi.fn();

            provider.on("data", listener);
            provider.emit("data", "payload");

            expect(listener).toHaveBeenCalledOnce();
            expect(listener).toHaveBeenCalledWith("payload");
        });

        it("invokes multiple listeners in registration order", () => {
            const provider = new NodeEventProvider();
            const calls: string[] = [];

            provider.on("evt", () => calls.push("first"));
            provider.on("evt", () => calls.push("second"));
            provider.emit("evt");

            expect(calls).toEqual(["first", "second"]);
        });

        it("forwards all arguments to the listener", () => {
            const provider = new NodeEventProvider();
            const listener = vi.fn();

            provider.on("multi", listener);
            provider.emit("multi", 1, "two", { three: 3 });

            expect(listener).toHaveBeenCalledWith(1, "two", { three: 3 });
        });

        it("does not invoke listeners registered for a different event", () => {
            const provider = new NodeEventProvider();
            const listener = vi.fn();

            provider.on("data", listener);
            provider.emit("other");

            expect(listener).not.toHaveBeenCalled();
        });
    });

    describe("once", () => {
        it("fires the listener exactly once", () => {
            const provider = new NodeEventProvider();
            const listener = vi.fn();

            provider.once("data", listener);
            provider.emit("data", "a");
            provider.emit("data", "b");

            expect(listener).toHaveBeenCalledOnce();
            expect(listener).toHaveBeenCalledWith("a");
        });

        it("removes the listener after first invocation", () => {
            const provider = new NodeEventProvider();
            provider.once("data", () => undefined);

            expect(provider.listenerCount("data")).toBe(1);
            provider.emit("data");
            expect(provider.listenerCount("data")).toBe(0);
        });
    });

    describe("off", () => {
        it("removes a previously registered listener", () => {
            const provider = new NodeEventProvider();
            const listener = vi.fn();

            provider.on("data", listener);
            provider.off("data", listener);
            provider.emit("data");

            expect(listener).not.toHaveBeenCalled();
        });

        it("only removes the exact listener reference", () => {
            const provider = new NodeEventProvider();
            const listenerA = vi.fn();
            const listenerB = vi.fn();

            provider.on("data", listenerA);
            provider.on("data", listenerB);
            provider.off("data", listenerA);
            provider.emit("data");

            expect(listenerA).not.toHaveBeenCalled();
            expect(listenerB).toHaveBeenCalledOnce();
        });

        it("is a no-op when the listener was never registered", () => {
            const provider = new NodeEventProvider();
            const listener = vi.fn();

            provider.off("data", listener);
            provider.emit("data");

            expect(listener).not.toHaveBeenCalled();
        });
    });

    describe("removeListener", () => {
        it("removes a previously registered listener (alias for off)", () => {
            const provider = new NodeEventProvider();
            const listener = vi.fn();

            provider.on("data", listener);
            provider.removeListener("data", listener);
            provider.emit("data");

            expect(listener).not.toHaveBeenCalled();
        });

        it("removes a once-registered listener before it fires", () => {
            const provider = new NodeEventProvider();
            const listener = vi.fn();

            provider.once("data", listener);
            provider.removeListener("data", listener);
            provider.emit("data");

            expect(listener).not.toHaveBeenCalled();
        });
    });

    describe("emit", () => {
        it("returns true when a listener is invoked", () => {
            const provider = new NodeEventProvider();
            provider.on("data", () => undefined);

            expect(provider.emit("data")).toBe(true);
        });

        it("returns false when no listeners are registered", () => {
            const provider = new NodeEventProvider();
            expect(provider.emit("data")).toBe(false);
        });

        it("returns true even for an unregistered event name with listeners", () => {
            const provider = new NodeEventProvider();
            provider.on("evt", () => undefined);
            expect(provider.emit("evt")).toBe(true);
        });
    });

    describe("listenerCount", () => {
        it("reports zero for an event with no listeners", () => {
            const provider = new NodeEventProvider();
            expect(provider.listenerCount("data")).toBe(0);
        });

        it("tracks listeners added via on and once", () => {
            const provider = new NodeEventProvider();
            const a = () => undefined;
            const b = () => undefined;

            provider.on("data", a);
            provider.once("data", b);

            expect(provider.listenerCount("data")).toBe(2);
        });

        it("decrements when a listener is removed", () => {
            const provider = new NodeEventProvider();
            const listener = () => undefined;

            provider.on("data", listener);
            expect(provider.listenerCount("data")).toBe(1);

            provider.off("data", listener);
            expect(provider.listenerCount("data")).toBe(0);
        });
    });

    describe("removeAllListeners", () => {
        it("removes all listeners for a specific event", () => {
            const provider = new NodeEventProvider();
            const a = vi.fn();
            const b = vi.fn();

            provider.on("data", a);
            provider.on("data", b);
            provider.removeAllListeners("data");

            provider.emit("data");

            expect(a).not.toHaveBeenCalled();
            expect(b).not.toHaveBeenCalled();
            expect(provider.listenerCount("data")).toBe(0);
        });

        it("does not affect listeners on other events", () => {
            const provider = new NodeEventProvider();
            const dataListener = vi.fn();
            const otherListener = vi.fn();

            provider.on("data", dataListener);
            provider.on("other", otherListener);
            provider.removeAllListeners("data");
            provider.emit("other");

            expect(dataListener).not.toHaveBeenCalled();
            expect(otherListener).toHaveBeenCalledOnce();
        });

        it("removes all listeners for every event when called with no argument", () => {
            const provider = new NodeEventProvider();
            const a = vi.fn();
            const b = vi.fn();

            provider.on("one", a);
            provider.on("two", b);
            provider.removeAllListeners();

            expect(provider.listenerCount("one")).toBe(0);
            expect(provider.listenerCount("two")).toBe(0);

            provider.emit("one");
            provider.emit("two");
            expect(a).not.toHaveBeenCalled();
            expect(b).not.toHaveBeenCalled();
        });

        it("is a safe no-op when no listeners exist", () => {
            const provider = new NodeEventProvider();
            provider.removeAllListeners();
            provider.removeAllListeners("data");

            expect(provider.listenerCount("data")).toBe(0);
        });
    });
});
