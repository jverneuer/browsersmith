/**
 * Harness for the behavior fixture. Same pattern as the bot-server harness but
 * for redirect/compression/timeout/abort tests.
 */

import { createClient } from "@browsercore/fetch";
import type { FetchClient, FetchOptions } from "@browsercore/fetch";
import { connectHttp1 } from "@browsercore/http1";
import type { Transport } from "@browsercore/transport";
import { connect as connectNet } from "node:net";
import { LoopbackTransport, loopbackTransportFactory } from "./fake-transport.js";
import { startBehaviorServer, stopBehaviorServer } from "./behavior-server.js";

export interface BehaviorHarness {
    readonly client: FetchClient;
    readonly baseUrl: string;
    readonly close(): Promise<void>;
}

export async function setupBehavior(): Promise<BehaviorHarness> {
    const { server, baseUrl, port } = await startBehaviorServer();
    const client = createClient({
        transportFactory: loopbackTransportFactory(port),
    });
    return {
        client,
        baseUrl,
        async close(): Promise<void> {
            await client.close();
            await stopBehaviorServer(server);
        },
    };
}

/** Fetch a path on the behavior fixture. */
export function fetchBehavior(
    bh: BehaviorHarness,
    path: string,
    options?: FetchOptions,
): Promise<ReturnType<FetchClient["fetch"]>> {
    return bh.client.fetch(`${bh.baseUrl}${path}`, options);
}

// Re-export the transport bits tests sometimes reach for directly.
export { LoopbackTransport, connectNet, connectHttp1 };
export type { Transport };
