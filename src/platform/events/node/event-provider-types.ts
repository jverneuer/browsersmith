/**
 * Platform-agnostic event provider interface.
 *
 * Defines the minimal pub/sub surface that BrowserCore needs for inter-protocol
 * events. Implemented by `NodeEventProvider` (Node.js) but can be backed by
 * `EventTarget` (browsers), `mitt`, or any other event system.
 */

export interface EventProvider {
    /**
     * Register a listener for the given event.
     * @param event - Event name to subscribe to.
     * @param listener - Callback invoked when the event is emitted.
     */
    on(event: string, listener: (...args: unknown[]) => void): void;

    /**
     * Register a one-time listener for the given event.
     * The listener is invoked once on the next emit, then automatically removed.
     * @param event - Event name to subscribe to.
     * @param listener - Callback invoked once when the event is emitted.
     */
    once(event: string, listener: (...args: unknown[]) => void): void;

    /**
     * Remove a previously registered listener.
     * @param event - Event name to unsubscribe from.
     * @param listener - The exact listener reference passed to `on` or `once`.
     */
    off(event: string, listener: (...args: unknown[]) => void): void;

    /**
     * Remove a previously registered listener (alias for `off`).
     * @param event - Event name to unsubscribe from.
     * @param listener - The exact listener reference passed to `on` or `once`.
     */
    removeListener(event: string, listener: (...args: unknown[]) => void): void;

    /**
     * Emit an event, synchronously invoking all registered listeners.
     * @param event - Event name to emit.
     * @param args - Arguments forwarded to each listener.
     * @returns `true` if any listener was invoked, `false` otherwise.
     */
    emit(event: string, ...args: unknown[]): boolean;

    /**
     * Report the number of listeners registered for the given event.
     * @param event - Event name to query.
     * @returns The number of registered listeners.
     */
    listenerCount(event: string): number;

    /**
     * Remove all listeners for the given event, or all events if `event` is omitted.
     * @param event - Optional event name to clear. Clears every event if omitted.
     */
    removeAllListeners(event?: string): void;
}
