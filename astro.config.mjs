import { defineConfig } from "astro/config";

import cloudflare from "@astrojs/cloudflare";

import react from "@astrojs/react";

// Site-attached Webflow Cloud app, mounted at /register on bfg-spec.webflow.io.
// `base` must match the environment's mount path.
export default defineConfig({
  base: "/register",
  output: "server",
  compressHTML: true,
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
