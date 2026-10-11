const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(relative) {
  const filename = path.join(__dirname, "..", relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, require }, { filename });
  return module.exports;
}

test("remaining road distance follows segments, not a straight line to destination", () => {
  const { remainingRoute, haversine } = load("src/lib/polyline.ts");
  const points = [[0, 0], [0, 0.01], [0.01, 0.01]];
  const result = remainingRoute(points, [0, 0.005]);
  assert.ok(Math.abs(result.distanceKm - (haversine([0, 0.005], [0, 0.01]) + haversine([0, 0.01], [0.01, 0.01]))) < 0.001);
  assert.equal(result.points[0][1], 0.005);
  assert.equal(remainingRoute(points, [1, 1]), null);
  assert.equal(remainingRoute([], [0, 0]), null);
});

test("voice updates deduplicate traffic, rate-limit distances and reset for a different trip", () => {
  const { DriverVoiceUpdates } = load("src/lib/driverVoice.ts");
  const updates = new DriverVoiceUpdates();
  const snapshot = { tripId: 1, status: "in_progress", remainingKm: 11, trafficMessage: null, gpsError: null };
  assert.match(updates.reset(snapshot, 0), /Voice updates on/);
  assert.equal(updates.update({ ...snapshot, remainingKm: 9 }, 1000), null);
  assert.match(updates.update({ ...snapshot, remainingKm: 9 }, 120000), /9.0 kilometres/);
  assert.equal(updates.update({ ...snapshot, remainingKm: 8 }, 121000), null);
  assert.match(updates.update({ ...snapshot, trafficMessage: "Traffic OK" }, 122000), /Traffic OK/);
  updates.update(snapshot, 123000);
  assert.equal(updates.update({ ...snapshot, trafficMessage: "Traffic OK" }, 124000), null);
  assert.match(updates.update({ ...snapshot, status: "paused" }, 125000), /Trip paused/);
  assert.match(updates.update({ ...snapshot, tripId: 2 }, 126000), /Voice updates on/);
});

test("sound starts only after a tap and cancels immediately on mute and unmount", () => {
  const React = require("react");
  const filename = path.join(__dirname, "..", "src", "components", "DriverVoiceToggle.tsx");
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const spoken = [];
  let cancellations = 0;
  const cleanups = [];
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, console,
    Date,
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    window: {
      SpeechSynthesisUtterance: true,
      speechSynthesis: { speak: (utterance) => spoken.push(utterance), cancel: () => cancellations++ },
    },
    require(id) {
      if (id === "@/lib/driverVoice") return load("src/lib/driverVoice.ts");
      if (id === "react") return {
        ...React,
        useState: (value) => [value, () => {}],
        useRef: (value) => ({ current: value }),
        useEffect: (effect) => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); },
      };
      return require(id);
    },
  }, { filename });
  const tree = module.exports.default({
    tripId: 1, status: "in_progress", remainingKm: 10,
    trafficMessage: null, gpsError: null, active: true,
  });
  const button = tree.props.children[0];
  assert.equal(spoken.length, 0);
  button.props.onClick();
  assert.equal(spoken.length, 1);
  button.props.onClick();
  assert.equal(cancellations, 1);
  button.props.onClick();
  assert.equal(spoken.length, 2);
  cleanups.forEach((cleanup) => cleanup());
  assert.equal(cancellations, 2);
});
