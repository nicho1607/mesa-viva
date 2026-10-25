import type { NextConfig } from "next";

// Nota: no activamos `cacheComponents` (Next 16). La app es casi toda dinámica
// (BD, cookies, tiempo real) y la arquitectura asume el modelo de caché clásico.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
