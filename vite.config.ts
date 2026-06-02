import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "PrizeRun Runner (POC)",
        short_name: "PrizeRun",
        description:
          "Deterministic Frogger/Crossy Road-style speedrun PWA prototype.",
        theme_color: "#2b2b33",
        background_color: "#12101c",
        display: "standalone",
        orientation: "portrait",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
});
