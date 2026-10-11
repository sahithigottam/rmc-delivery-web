const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const module_ = { exports: {} };
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync(path.join(__dirname, "..", "src", "lib", "completionReasons.ts"), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText, { module: module_, exports: module_.exports });
const { reasonChips, applyReasonChip, FAILURE_REASONS, EXPIRED_LOAD_REASONS } = module_.exports;

test("quick reasons appear only where a note is required", () => {
  assert.deepEqual([...reasonChips(false, false)], [...FAILURE_REASONS]);
  assert.deepEqual([...reasonChips(false, true)], [...FAILURE_REASONS]);
  assert.deepEqual([...reasonChips(true, true)], [...EXPIRED_LOAD_REASONS]);
  assert.deepEqual([...reasonChips(true, false)], []);
  assert.deepEqual([...reasonChips(null, true)], []);
});

test("choosing a reason fills an empty note, switches between reasons and clears when chosen again", () => {
  const chips = [...FAILURE_REASONS];
  assert.equal(applyReasonChip("", "Truck broke down", chips), "Truck broke down");
  assert.equal(applyReasonChip("   ", "Truck broke down", chips), "Truck broke down");
  assert.equal(applyReasonChip("Truck broke down", "Site refused load", chips), "Site refused load");
  assert.equal(applyReasonChip("Truck broke down", "Truck broke down", chips), "");
});

test("a note the driver typed is never overwritten by a reason", () => {
  const chips = [...FAILURE_REASONS];
  assert.equal(
    applyReasonChip("Gate locked, waited 20 min", "Site not ready", chips),
    "Gate locked, waited 20 min; Site not ready",
  );
  assert.equal(
    applyReasonChip("Gate locked; Site not ready", "Site not ready", chips),
    "Gate locked; Site not ready",
  );
});
