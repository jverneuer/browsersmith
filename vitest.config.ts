import { definePackageConfig } from "@browsercore/dev/vitest";

// Adopts the shared @browsercore/dev vitest config (reporters, src coverage,
// timeouts) and layers on the hard 94% coverage gate. The thresholds are the
// whole point of this PR; the shared config's `coverage` extension point is
// how consumers opt into extra coverage settings without forking the config.
export default definePackageConfig({
    name: "browsersmith",
    coverage: {
        thresholds: { statements: 94, branches: 94, functions: 94, lines: 94 },
    },
});
