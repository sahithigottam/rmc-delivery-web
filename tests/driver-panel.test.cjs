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
      if (id === "@/lib/completionReasons") {
        const reasons = { exports: {} };
        vm.runInNewContext(ts.transpileModule(
          fs.readFileSync(path.join(__dirname, "..", "src", "lib", "completionReasons.ts"), "utf8"),
          { compilerOptions: { module: ts.ModuleKind.CommonJS } },
        ).outputText, { module: reasons, exports: reasons.exports });
        return reasons.exports;
      }
      if (id === "@/lib/nearSite") return {
        isNearSite: (position) => Array.isArray(position) && position[0] === 1 && position[1] === 2,
      };
      if (id === "./Toast") return { showToast() {} };
      if (id === "./TruckIcon") return { default: () => null };
      if (id === "@/lib/time") return {
        timeZoneForTrip: () => "Asia/Kolkata", formatInZone: () => "10:30 pm", zoneLabel: () => "IST",
        isEtaStale: (iso) => Date.parse(iso) + 60_000 < Date.now(),
      };
      return require(id);
    },
  }, { filename });
  const props = {
    trip: {
      id: 13, status, start_address: "Plant", end_address: "Destination",
      original_distance_meters: 40000, original_duration_seconds: 3600,
      remaining_distance_meters: 10000, remaining_duration_seconds: 1200,
      estimated_arrival: new Date(Date.now() + 3_600_000).toISOString(), load_minutes_remaining: 0,
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

test("a passed ETA is marked outdated instead of shown as an arrival time", () => {
  const { Component, props } = panel("in_progress");
  props.trip.estimated_arrival = new Date(Date.now() - 3_600_000).toISOString();
  const markup = renderToStaticMarkup(React.createElement(Component, props));
  assert.match(markup, />Outdated</);
  assert.match(markup, /was 10:30 pm/);
  assert.doesNotMatch(markup, /font-semibold text-on-surface">10:30 pm/);
});

test("End Trip is a quiet secondary button until the driver is near the site", () => {
  const far = panel("in_progress");
  const farMarkup = renderToStaticMarkup(React.createElement(far.Component, far.props));
  assert.match(farMarkup, /border border-outline-variant font-medium text-on-surface-variant[^"]*"[^>]*>\s*End Trip/);
  assert.doesNotMatch(farMarkup, /bg-md-green[^>]*>\s*End Trip/);
  const near = panel("in_progress");
  near.props.driverPosition = [1, 2];
  const nearMarkup = renderToStaticMarkup(React.createElement(near.Component, near.props));
  assert.match(nearMarkup, /bg-md-green text-white font-semibold[^>]*>\s*End Trip/);
  const office = panel("in_progress");
  delete office.props.driverControls;
  const officeMarkup = renderToStaticMarkup(React.createElement(office.Component, office.props));
  assert.match(officeMarkup, /bg-md-green text-white font-semibold[^>]*>\s*End Trip/);
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

test("end-trip form offers one-tap reasons where a note is required and keeps typing available", () => {
  const failed = panel("in_progress", { 4: true, 5: false, 6: "" });
  const failedMarkup = renderToStaticMarkup(React.createElement(failed.Component, failed.props));
  for (const reason of ["Truck broke down", "Site refused load", "Site not ready", "Could not reach site"]) {
    assert.match(failedMarkup, new RegExp(`aria-pressed="false"[^>]*>${reason}<`));
  }
  assert.match(failedMarkup, /role="group" aria-label="Quick reasons"/);
  assert.match(failedMarkup, /<textarea/);
  assert.match(failedMarkup, /<button disabled=""[^>]*>Confirm<\/button>/);

  const chosen = panel("in_progress", { 4: true, 5: false, 6: "Truck broke down" });
  const chosenMarkup = renderToStaticMarkup(React.createElement(chosen.Component, chosen.props));
  assert.match(chosenMarkup, /aria-pressed="true"[^>]*>Truck broke down</);
  assert.doesNotMatch(chosenMarkup, /<button disabled=""[^>]*>Confirm<\/button>/, "a chosen reason satisfies the required note");

  const expired = panel("in_progress", { 4: true, 5: true, 6: "" });
  const expiredMarkup = renderToStaticMarkup(React.createElement(expired.Component, expired.props));
  assert.match(expiredMarkup, />Site engineer approved after slump test</);

  const fresh = panel("in_progress", { 4: true, 5: true, 6: "" });
  fresh.props.trip.load_minutes_remaining = 30;
  fresh.props.trip.load_status = "fresh";
  const freshMarkup = renderToStaticMarkup(React.createElement(fresh.Component, fresh.props));
  assert.doesNotMatch(freshMarkup, /Quick reasons/);
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

test("sound is one round map button for the displayed trip, not in the header or the sheet", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "components", "MainApp.tsx"), "utf8");
  assert.equal((source.match(/<DriverVoiceToggle\b/g) ?? []).length, 1);
  assert.doesNotMatch(source, /aria-label="Live trip controls"/, "the extra top row is gone");
  const sound = source.indexOf("<DriverVoiceToggle");
  assert.ok(sound > source.indexOf("<MapView"), "mounted over the map");
  assert.ok(sound > source.indexOf("</aside>"), "outside the sheet, so it is never remounted by it");
  assert.ok(sound < source.indexOf("</main>"));
  const wrapper = source.slice(source.lastIndexOf("{activeTab", sound), sound + 400);
  assert.match(wrapper, /activeTab === "trip" && shownTrip &&/, "also shown for trips opened from the list");
  assert.match(wrapper, /absolute right-3 top-\[4\.25rem\] z-\[1100\]/);
  assert.match(wrapper, /key=\{shownTrip.id\}/);
  const header = source.slice(source.indexOf("<header"), source.indexOf("</header>"));
  assert.doesNotMatch(header, /DriverVoiceToggle/);
});
