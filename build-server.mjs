// build-server.mjs - build server.cjs bundle com esbuild
import { build } from "esbuild";
await build({
  entryPoints: ["src/server/index.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
  sourcemap: true,
  outfile: "dist/server.cjs",
  define: {
    "import.meta.url": JSON.stringify("file:///app/dist/server.cjs"),
  },
});
console.log("OK dist/server.cjs");
