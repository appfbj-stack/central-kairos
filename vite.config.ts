import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  root: "src/client",
  build: {
    outDir: "../../dist",
    emptyOutDir: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/client/src"),
    },
  },
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:3013",
    },
  },
});
