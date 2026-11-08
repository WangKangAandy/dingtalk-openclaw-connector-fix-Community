import { defineConfig } from "tsdown";
export default defineConfig({ entry: { index: "index.ts" }, format: "esm", target: "node24", platform: "node", outDir: "dist", clean: true, dts: false,
  deps: { neverBundle: [/^openclaw(\/.*)?$/, /^@dingtalk-real-ai\/dingtalk-connector(\/.*)?$/, "yaml", "zod", /^node:/] } });
