import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        include: ["tests/**/*.test.ts"],
        testTimeout: 15_000,
        hookTimeout: 15_000,
        globals: false,
        coverage: {
            provider: "v8",
            include: ["src/**/*.ts"],
            all: true,
            reporter: ["text", "json-summary"],
        },
    },
});
