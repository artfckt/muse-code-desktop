import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  optimizeDeps: { include: ["@xterm/xterm", "@xterm/addon-fit"] },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
