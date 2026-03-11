import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Allow Leaflet tile images from CDN */
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.basemaps.cartocdn.com" },
      { protocol: "https", hostname: "*.tile.openstreetmap.org" },
    ],
  },
};

export default nextConfig;
