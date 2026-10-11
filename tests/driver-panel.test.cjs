const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function panel(status, state = {}) {
  const filename = path.join(__dirname, "..", "src", "components", "TripManagement.tsx");
  const source = fs.readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  let slot = 0;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require(id) {
      if (id === "react") return {
        ...React, useEffect() {},
        useState: (initial) => {
          const index = slot++;
          return [index in state ? state[index] : initial, () => {}];
        },
      };
      if (id === "@/lib/api") return {};
      if (id === "./Toast") return { showToast() {} };
      if (id === "./TruckIcon") return { default: () => null };
      if (id === "@/lib/time") return {
        timeZoneForTrip: () => "Asia/Kolkata", formatInZone: () => "10:30 pm", zoneLabel: () => "IST",
      };
      return require(id);
    },
  }, { filename });
  const props = {
    trip: {
      id: 13, status, start_address: "Plant", end_address: "Destination",
      original_distance_meters: 40000, original_duration_seconds: 3600,
      remaining_distance_meters: 10000, remaining_duration_seconds: 1200,
      estimated_arrival: "2026-10-11T17:00:00Z", load_minutes_remaining: 0,
      load_max_life_minutes: 90, load_status: "expired",
      end_lat: 1, end_lng: 2, reroute_count: 0,
    },
    onTripUpdated() {},
    driverControls: {
      gpsState: "idle", gpsError: null, remainingKm: 9.2, onStartGps() {}, onFormOpen() {},
    },
  };
  return { Component: module.exports.default, props, source };
}

test("driver panel shows current metrics, GPS and compact route addresses", () => {
  const { Component, props } = panel("in_progress");
  const markup = renderToStaticMarkup(React.createElement(Component, props));
  assert.match(markup, /9.2 km/);
  assert.match(markup, /10:30 pm/);
  assert.match(markup, /expired/);
  assert.match(markup, /GPS not started on this device/);
  assert.match(markup, /Start GPS/);
  assert.match(markup, /End Trip/);
  assert.doesNotMatch(markup, /<details/);
  assert.match(markup, /From: Plant/);
  assert.match(markup, /To: Destination/);
  assert.match(markup, /p-3 flex flex-col/);
});

test("stage actions match pending, tracking, paused and completed trips", () => {
  for (const [status, expected, absent] of [
    ["pending", "Start Trip", "End Trip"],
    ["paused", "Resume", "Start GPS"],
    ["completed", "Trip #13", "End Trip"],
  ]) {
    const { Component, props } = panel(status);
    const markup = renderToStaticMarkup(React.createElement(Component, props));
    assert.ok(markup.includes(expected));
    assert.ok(!markup.includes(absent));
  }
  const { Component, props } = panel("in_progress");
  props.driverControls.gpsState = "active";
  const markup = renderToStaticMarkup(React.createElement(Component, props));
  assert.match(markup, /GPS active/);
  assert.doesNotMatch(markup, /Start GPS/);
  assert.doesNotMatch(markup, /Start Trip|Begin Trip|Ready to Begin/);
  const openBeginForm = panel("in_progress", { 1: true });
  const staleFormMarkup = renderToStaticMarkup(React.createElement(openBeginForm.Component, openBeginForm.props));
  assert.doesNotMatch(staleFormMarkup, /Start Trip|Begin Trip|Ready to Begin/);
});

test("end-trip flow retains required notes and disabled confirmation for failed or expired-success outcomes", () => {
  for (const succeeded of [false, true]) {
    // Hook slots: loading, begin form, batch time, retarder, end form, outcome, notes.
    const { Component, props } = panel("in_progress", { 4: true, 5: succeeded, 6: "" });
    const markup = renderToStaticMarkup(React.createElement(Component, props));
    assert.match(markup, /Succeeded/);
    assert.match(markup, /Failed/);
    assert.match(markup, /aria-label="Delivery notes \(required\)" aria-required="true"/);
    assert.match(markup, /<button disabled=""[^>]*>Confirm<\/button>/);
    assert.match(markup, /flagged for review/);
  }
});

test("turn-by-turn instructions are in a collapsed accordion and forms expand the sheet", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "components", "MainApp.tsx"), "utf8");
  assert.match(source, /<details className="trip-accordion">\s*<summary[^>]*>\s*Turn-by-turn/);
  assert.match(source, /onFormOpen: \(\) => setSheet\("full"\)/);
  assert.match(source, /GPS and simulation settings<\/h3>/);
  assert.match(source, /More details<\/summary>/);
  assert.doesNotMatch(source, /Trip history<\/summary>|Route information<\/summary>|GPS and simulation settings<\/summary>/);
  assert.equal((source.match(/<SimulationControls\b/g) ?? []).length, 1);
  assert.ok(source.indexOf("<SimulationControls") < source.indexOf("<TripManagement"));
  assert.ok(source.indexOf("<SimulationControls") < source.indexOf("More details</summary>"));
});

test("mode switch reflects GPS selection and toggles in both directions", () => {
  const filename = path.join(__dirname, "..", "src", "components", "SimulationControls.tsx");
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require(id) {
      if (id === "react") return { ...React, useEffect() {}, useState: () => [Date.now(), () => {}] };
      if (id === "./TruckIcon") return { default: () => null };
      return require(id);
    },
  }, { filename });
  for (const gpsMode of [false, true]) {
    let selected;
    const tree = module.exports.default({
      gpsMode, simState: "idle", progress: 0, remainingKm: 10,
      gpsState: "idle", gpsRemainingKm: 10, speedMultiplier: 1,
      onGpsModeChange(value) { selected = value; },
    });
    const modeSwitch = tree.props.children[0].props.children[1];
    assert.equal(modeSwitch.props.role, "switch");
    assert.equal(modeSwitch.props["aria-checked"], gpsMode);
    modeSwitch.props.onClick();
    assert.equal(selected, !gpsMode);
    const markup = renderToStaticMarkup(tree);
    assert.match(markup, /Simulation/);
    assert.match(markup, /GPS/);
  }
});

test("sound stays outside the sheet and map for the currently displayed trip", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "components", "MainApp.tsx"), "utf8");
  assert.equal((source.match(/<DriverVoiceToggle\b/g) ?? []).length, 1);
  assert.match(source, /activeTab === "trip" && shownTrip &&/);
  const toolbarStart = source.indexOf('aria-label="Live trip controls"');
  const soundStart = source.indexOf("<DriverVoiceToggle");
  const bodyStart = source.indexOf("{/* Body */}");
  assert.ok(toolbarStart < soundStart && soundStart < bodyStart);
  const toolbar = source.slice(toolbarStart, bodyStart);
  assert.match(toolbar, /key=\{shownTrip.id\}/);
  assert.doesNotMatch(toolbar, /\bsheet\b|absolute|app-header/);
});
