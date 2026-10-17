import { defineConfig } from "astro/config";

import cloudflare from "@astrojs/cloudflare";

import react from "@astrojs/react";

// Site-attached Webflow Cloud app, mounted at /register on bfg-spec.webflow.io.
// `base` must match the environment's mount path.
export default defineConfig({
  base: "/register",
  output: "server",
  compressHTML: true,
  // The stylesheet is small (about 7 KB compressed). Inlining it removes a render-blocking
  // request to the separate asset host, which was the main delay before first paint on mobile.
  build: { inlineStylesheets: "always" },
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),

  // Kept because Webflow's deployer expects the React integration; the app itself ships no React.
  integrations: [react()],
  vite: {
    resolve: {
      // Use react-dom/server.edge instead of react-dom/server.browser for React 19.
      alias: import.meta.env.PROD
        ? {
            "react-dom/server": "react-dom/server.edge",
          }
        : undefined,
    },
  },
});
