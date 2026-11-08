import type { NextConfig } from "next";

// Nota: no activamos `cacheComponents` (Next 16). La app es casi toda dinámica
// (BD, cookies, tiempo real) y la arquitectura asume el modelo de caché clásico.
const nextConfig: NextConfig = {
  allowedDevOrigins: process.env.PUBLIC_BASE_URL ? [new URL(process.env.PUBLIC_BASE_URL).hostname] : [],
  turbopack: {
    // Fija la raíz al proyecto: evita que Next tome un package-lock.json de una carpeta superior.
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
