import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8080",
      "/health": "http://127.0.0.1:8080",
      "/signal": {
        target: "ws://127.0.0.1:8080",
        ws: true
      }
    }
  },
  preview: {
    port: 4173
  }
});
