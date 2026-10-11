const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("API proxy targets the backend configured by the environment", async () => {
  const previous = process.env.BACKEND_URL;
  process.env.BACKEND_URL = "https://rmc-delivery-backend2.onrender.com";
  try {
    const { default: config } = await import("../next.config.mjs");
    const rewrites = await config.rewrites();
    assert.deepEqual(rewrites, [{
      source: "/api/v1/:path*",
      destination: "https://rmc-delivery-backend2.onrender.com/api/v1/:path*",
    }]);
    const source = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "api.ts"), "utf8");
    assert.match(source, /const API = process\.env\.NEXT_PUBLIC_API_URL \?\? "\/api\/v1";/);
  } finally {
    if (previous === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = previous;
  }
});
