import { defineConfig, Options } from "tsup";

export default defineConfig((options: Options) => ({
  entry: ["agent.ts"],
  banner: {
    js: "'use client'",
  },
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  // external: ["react"],
  injectStyle: true,
  ...options,
}));
