import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    {
      name: "desktop-content-security-policy",
      transformIndexHtml(html) {
        const policy = `default-src 'self'; script-src 'self'${command === "serve" ? " 'unsafe-inline'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' muse-media: https: http: data: blob:; media-src 'self' muse-media: https: http: blob:; font-src 'self' data:; connect-src 'self' muse-media: https:${command === "serve" ? " ws://localhost:5173 ws://127.0.0.1:5173" : ""}; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'`;
        return html.replace(
          "<head>",
          `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`,
        );
      },
    },
  ],
  base: "./",
  optimizeDeps: { include: ["@xterm/xterm", "@xterm/addon-fit"] },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
}));
