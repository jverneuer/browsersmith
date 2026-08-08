/**
 * Platform composition root for browsersmith.
 *
 * This module builds the singleton {@link Platform} instance that threads
 * all runtime dependencies through the stack. browsersmith is the ONLY
 * package allowed to import `node:*` modules — every other package depends
 * on `@browsercore/contracts` interfaces and receives implementations via
 * the Platform.
 *
 * The default {@link platform} is built once at module load. Tests construct
 * their own Platform via {@link createPlatform} with mock adapters.
 */

import { createPlatform, type Platform, type PlatformOptions } from "./platform/index.js";

// Re-export createPlatform so consumers can build custom platforms (e.g. tests).
export { createPlatform };
export type { PlatformOptions };

/**
 * The default platform instance — built once at startup.
 *
 * Contains the Node.js adapters for all runtime dependencies. Injected into
 * protocol packages through their options objects. Tests bypass this and
 * construct a Platform with mock adapters.
 */
export const platform: Platform = createPlatform();

// Re-export commonly-used platform members for backward compatibility.
// New code should import from "./platform/index.js" directly.
export { nodeNet, nodeDns } from "./platform/network/node/index.js";
export { nodeCryptoProvider } from "./platform/crypto/node/index.js";
export { nodeCompression } from "./platform/compression/node/index.js";
export { nodeEventProvider } from "./platform/events/node/index.js";
export { noOpTelemetry } from "./platform/telemetry/noop/index.js";
export { nodeTime } from "./platform/time/node/index.js";

// Legacy aliases — these match the old export names so existing consumers
// (crawl.ts, tests) keep working during the migration.
/** @deprecated Use `platform.crypto.provider` instead. */
export const defaultCryptoProvider = platform.crypto.provider;
/** @deprecated Use `platform.time.clock` instead. */
export const defaultClock = platform.time.clock;
