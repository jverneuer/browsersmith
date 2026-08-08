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
 * Default Node.js event provider instance.
 */
export const nodeEventProvider = new NodeEventProvider();
