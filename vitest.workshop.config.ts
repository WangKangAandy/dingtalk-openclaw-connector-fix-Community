import { defineConfig } from "vitest/config"
import path from "node:path"
export default defineConfig({
  resolve: { alias: {
    // Tests of the replacement require the pinned-main SDK surface. Runtime tests
    // below explicitly stub host scheduling; WSL tests must use its real owner.
    "openclaw/plugin-sdk/skill-workshop-host-runtime": path.resolve("tests/scoped-workshop/host-runtime-fixture.ts"),
  } },
  test: { environment: "node", include: ["tests/scoped-workshop/*.test.ts"], testTimeout: 30000 },
})
