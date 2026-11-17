/**
 * Node.js platform adapter for the {@link EventProvider} contract.
 *
 * Implements the platform-agnostic EventProvider interface using Node's
 * native `EventEmitter`. This is the only file in the stack that depends
 * on `node:events`'s concrete EventEmitter — the rest of BrowserCore
 * depends only on the EventProvider interface.
 */

import { EventEmitter } from "node:events";
import type { EventProvider } from "./event-provider-types.js";

/**
 * Node.js implementation of the {@link EventProvider} contract.
 *
 * Wraps Node's `EventEmitter` to provide a platform-agnostic pub/sub
 * interface for inter-protocol events.
 */
export class NodeEventProvider implements EventProvider {
    private readonly emitter = new EventEmitter();

    on(event: string, listener: (...args: unknown[]) => void): void {
        this.emitter.on(event, listener);
    }

    once(event: string, listener: (...args: unknown[]) => void): void {
        this.emitter.once(event, listener);
    }

    off(event: string, listener: (...args: unknown[]) => void): void {
        this.emitter.off(event, listener);
    }

    removeListener(event: string, listener: (...args: unknown[]) => void): void {
        this.emitter.removeListener(event, listener);
    }

    emit(event: string, ...args: unknown[]): boolean {
        return this.emitter.emit(event, ...args);
    }

    listenerCount(event: string): number {
        return this.emitter.listenerCount(event);
    }

    removeAllListeners(event?: string): void {
        // Pass through only when an event is explicitly provided —
        // `removeAllListeners(undefined)` would target the event named
        // "undefined", not clear every event (Node checks arguments.length).
        if (event === undefined) {
            this.emitter.removeAllListeners();
        } else {
            this.emitter.removeAllListeners(event);
        }
    }
}

/**
 * Memoized default provider — constructed on first method call, never at
 * import.
 */
let defaultProvider: NodeEventProvider | undefined;

function defaultProviderInstance(): NodeEventProvider {
    defaultProvider ??= new NodeEventProvider();
    return defaultProvider;
}

/**
 * Default Node.js event provider — a LAZY singleton.
 *
 * WHY not `export const nodeEventProvider = new NodeEventProvider()`: that
 * constructed an `EventEmitter` at module load (the replaceability audit's
 * module-load side-effect finding — same rationale as the lazy `platform`
 * in `wiring.ts`). Each method below forwards to a `NodeEventProvider`
 * built on the first CALL, so importing the module is free while
 * `import { nodeEventProvider }` keeps working unchanged. Explicit typed
 * forwarding (instead of a Proxy) keeps the surface exactly the
 * {@link EventProvider} contract — no `any` at a trap boundary.
 */
export const nodeEventProvider: EventProvider = {
    on: (event, listener) => {
        defaultProviderInstance().on(event, listener);
    },
    once: (event, listener) => {
        defaultProviderInstance().once(event, listener);
    },
    off: (event, listener) => {
        defaultProviderInstance().off(event, listener);
    },
    removeListener: (event, listener) => {
        defaultProviderInstance().removeListener(event, listener);
    },
    emit: (event, ...args) => {
        return defaultProviderInstance().emit(event, ...args);
    },
    listenerCount: (event) => {
        return defaultProviderInstance().listenerCount(event);
    },
    removeAllListeners: (event) => {
        defaultProviderInstance().removeAllListeners(event);
    },
};
