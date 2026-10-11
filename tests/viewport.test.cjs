const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const postcss = require("postcss");
const tailwindcss = require("tailwindcss");

const root = path.join(__dirname, "..");

test("application viewport keeps dynamic height after the legacy fallback in generated CSS", async () => {
  const source = fs.readFileSync(path.join(root, "src", "app", "globals.css"), "utf8");
  const result = await postcss([
    tailwindcss({ content: [{ raw: "app-viewport flex flex-col", extension: "html" }] }),
  ]).process(source, { from: undefined });
  const heights = [];
  result.root.walkRules(".app-viewport", (rule) => {
    rule.walkDecls("height", (declaration) => heights.push(declaration.value));
  });
  assert.deepEqual(heights, ["100vh", "100dvh"]);
});

test("both application shells use the shared viewport without competing height utilities", () => {
  for (const component of ["MainApp", "CapabilityGate"]) {
    const source = fs.readFileSync(path.join(root, "src", "components", `${component}.tsx`), "utf8");
    assert.match(source, /className="app-viewport flex flex-col/);
    assert.doesNotMatch(source, /\bh-screen\b|\bh-dvh\b/);
  }
});
