/**
 * Lazy-singleton proof for the Node event provider
 * (`src/platform/events/node/event-provider.ts`).
 *
 * `nodeEventProvider` defers ALL construction to first use (same rationale
 * as the lazy `platform`: no module-load side effects). This file counts
 * `EventEmitter` constructions by mocking `node:events` with a counting
 * subclass — importing the module must construct nothing; the first method
 * call constructs exactly one provider (memoized thereafter).
 *
 * This file deliberately imports ONLY the event-provider module: the
 * node:events mock applies to everything in its module graph.
 */

import { describe, expect, it, vi } from "vitest";

const constructions = vi.hoisted(() => ({ count: 0 }));

vi.mock("node:events", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:events")>();
    class CountingEventEmitter extends actual.EventEmitter {
        constructor() {
            super();
            constructions.count += 1;
        }
    }
    return { ...actual, EventEmitter: CountingEventEmitter };
});

import { NodeEventProvider, nodeEventProvider } from "../../../../src/platform/events/node/index.js";

describe("nodeEventProvider — lazy singleton", () => {
    it("importing the module constructs no EventEmitter", () => {
        expect(constructions.count).toBe(0);
    });

    it("first method use constructs exactly one EventEmitter", () => {
        expect(nodeEventProvider.listenerCount("crawl")).toBe(0);
        expect(constructions.count).toBe(1);
    });

    it("later calls reuse the memoized provider and behave like an EventEmitter", () => {
        let heard = 0;
        nodeEventProvider.on("tick", () => {
            heard += 1;
        });
        expect(nodeEventProvider.listenerCount("tick")).toBe(1);
        expect(nodeEventProvider.emit("tick")).toBe(true);
        expect(heard).toBe(1);
        expect(constructions.count).toBe(1);
    });

    it("the exported class still constructs eagerly when instantiated directly", () => {
        const provider = new NodeEventProvider();
        provider.on("x", () => {});
        expect(provider.listenerCount("x")).toBe(1);
        // One construction for the explicit instance, still exactly one for
        // the lazy singleton.
        expect(constructions.count).toBe(2);
    });
});
