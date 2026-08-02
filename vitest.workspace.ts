import { defineWorkspace } from "vitest/config";

// Vitest workspace: each package owns its own `tests/` and vitest config is
// inherited from this workspace definition. Packages may add a local
// vitest.config.ts to extend these defaults.
export default defineWorkspace([
  "packages/*",
  {
    test: {
      name: "network-packages",
      root: ".",
      include: ["packages/**/tests/**/*.test.ts"],
      environment: "node",
      globals: false,
      // Protocol tests can involve crypto / socket timing; give them room.
      testTimeout: 30_000,
      hookTimeout: 30_000,
      typecheck: {
        enabled: true,
        tsconfig: "./tsconfig.base.json",
      },
    },
  },
]);
