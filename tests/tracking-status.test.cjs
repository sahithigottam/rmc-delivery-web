const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = path.join(__dirname, "..");

function load(relative, mocks = {}) {
  const filename = path.join(root, "src", relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require: (id) => (id in mocks ? mocks[id] : require(id)),
  }, { filename });
  return module.exports;
}

const { trackingStatus } = load("lib/trackingStatus.ts");
const now = 1_000_000;
const healthy = {
  status: "in_progress", gpsMode: true, gpsState: "active", simActive: false,
  lastFixAt: now - 10_000, lastSentAt: now - 5_000, pendingCount: 0, now,
};
const label = (overrides) => trackingStatus({ ...healthy, ...overrides })?.label;

test("Live tracking is claimed only with a recent fix and a confirmed upload", () => {
  const live = trackingStatus(healthy);
  assert.equal(live.label, "Live tracking");
  assert.equal(live.tone, "ok");
  assert.equal(label({ lastSentAt: null }), "Connecting");
  assert.equal(label({ lastSentAt: now - 120_001 }), "Not sending");
  assert.equal(label({ lastFixAt: null }), "No GPS signal");
  assert.equal(label({ lastFixAt: now - 120_001 }), "No GPS signal");
  assert.equal(label({ pendingCount: 3 }), "Not sending");
  assert.match(trackingStatus({ ...healthy, pendingCount: 1 }).detail, /1 location waiting/);
  assert.match(trackingStatus({ ...healthy, pendingCount: 3 }).detail, /3 locations waiting/);
  for (const warning of [{ lastSentAt: null }, { lastFixAt: null }, { pendingCount: 2 }]) {
    assert.equal(trackingStatus({ ...healthy, ...warning }).tone, "warn");
  }
});

test("device GPS states are reported honestly", () => {
  assert.equal(label({ gpsState: "requesting" }), "Locating");
  assert.equal(label({ gpsState: "idle" }), "GPS off");
  const error = trackingStatus({ ...healthy, gpsState: "error" });
  assert.equal(error.label, "GPS unavailable");
  assert.equal(error.tone, "bad");
});

test("simulation is labelled and never reported as live tracking", () => {
  const sim = trackingStatus({ ...healthy, gpsMode: false, simActive: true });
  assert.equal(sim.label, "Simulation");
  assert.match(sim.detail, /Nothing is sent/);
  assert.notEqual(sim.label, "Live tracking");
  const off = trackingStatus({ ...healthy, gpsMode: false, simActive: false, gpsState: "active" });
  assert.equal(off.label, "GPS off", "in progress but not sharing a location");
  assert.equal(off.tone, "warn");
});

test("nothing is reported unless the trip is in progress", () => {
  for (const status of ["pending", "paused", "completed", "cancelled"]) {
    assert.equal(trackingStatus({ ...healthy, status }), null);
  }
});

test("the header chip shows the label and explains it, and hides when there is nothing to say", () => {
  const Chip = load("components/HeaderTrackingStatus.tsx", {
    react: { ...React, useState: (value) => [typeof value === "function" ? value() : value, () => {}], useEffect() {} },
    "@/lib/trackingStatus": { trackingStatus },
  }).default;
  const props = { ...healthy, lastFixAt: Date.now(), lastSentAt: Date.now(), now: undefined };
  delete props.now;
  const live = renderToStaticMarkup(React.createElement(Chip, props));
  assert.match(live, /role="status"/);
  assert.match(live, />Live tracking</);
  assert.match(live, /title="Your location is reaching the office\."/);
  assert.match(live, /bg-md-green animate-pulse/);
  const sim = renderToStaticMarkup(React.createElement(Chip, { ...props, gpsMode: false, simActive: true }));
  assert.match(sim, />Simulation</);
  assert.match(sim, /bg-md-yellow/);
  assert.doesNotMatch(sim, /Live tracking/);
  const error = renderToStaticMarkup(React.createElement(Chip, { ...props, gpsState: "error" }));
  assert.match(error, /bg-md-red/);
  assert.equal(renderToStaticMarkup(React.createElement(Chip, { ...props, status: "paused" })), "");
});

test("the header no longer shows a tracking label based on polling", () => {
  const source = fs.readFileSync(path.join(root, "src", "components", "MainApp.tsx"), "utf8");
  assert.doesNotMatch(source, /Live Tracking/);
  assert.doesNotMatch(source, /connected && liveTrip/);
  const header = source.slice(source.indexOf("<header"), source.indexOf("</header>"));
  assert.match(header, /<HeaderTrackingStatus/);
  assert.match(header, /simActive=\{!gpsMode && sim\.simState !== "idle"\}/);
  assert.match(header, /lastSentAt=\{gps\.lastSentAt\}/);
});
