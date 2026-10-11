const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

test("pending trip polling refreshes status and ignores requests started before a trip action", async () => {
  const filename = path.join(__dirname, "..", "src", "hooks", "useTripStream.ts");
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const responses = [];
  const updates = [];
  let interval;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, console,
    setInterval(callback) { interval = callback; return 1; },
    clearInterval() {},
    require(id) {
      if (id === "react") return {
        useRef: (value) => ({ current: value }),
        useState: (value) => [value, () => {}],
        useCallback: (callback) => callback,
        useEffect: (effect) => effect(),
      };
      if (id === "@/lib/api") return {
        getTrip: () => new Promise((resolve) => responses.push(resolve)),
      };
      if (id === "@/components/Toast") return { showToast() {} };
      throw new Error(`Unexpected import ${id}`);
    },
  }, { filename });
  const stream = module.exports.useTripStream({
    tripId: 16, enabled: true, onTripUpdate: (trip) => updates.push(trip),
  });
  stream.discardPendingUpdates();
  responses.shift()({ id: 16, status: "pending", reroute_count: 0 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(updates.length, 0);
  interval();
  responses.shift()({ id: 16, status: "in_progress", reroute_count: 0 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(updates.length, 1);
  assert.equal(updates[0].status, "in_progress");
});

test("displayed pending trips and trips opened from the list are monitored", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "components", "MainApp.tsx"), "utf8");
  assert.match(source, /const monitoredTrip = viewedTrip \?\? trip/);
  assert.match(source, /enabled: monitoredTrip\?\.status === "pending"/);
  assert.match(source, /setViewedTrip\(\(current\) =>/);
  assert.match(source, /discardPendingUpdates\(\);\s*handleTripUpdate\(updated\)/);
});
