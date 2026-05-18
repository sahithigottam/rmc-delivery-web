import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the backend URL to be set at build time via NEXT_PUBLIC_API_URL.
  // When that env var is set, all /api/v1/* calls go directly to the backend.
  // No proxy needed — the frontend calls the Railway URL directly.
};

export default nextConfig;
