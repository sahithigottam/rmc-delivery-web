const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");

const root = path.join(__dirname, "..");

function load(relative, mocks = {}) {
  const filename = path.join(root, "src", relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, console,
    require: (id) => (id in mocks ? mocks[id] : require(id)),
  }, { filename });
  return module.exports;
}

const { nextTripAction, liveTripSummary } = load("lib/liveTripSummary.ts");

test("next action follows trip stage and whether device GPS is running", () => {
  assert.deepEqual({ ...nextTripAction("pending", false) }, { type: "begin", label: "Start Trip" });
  assert.deepEqual({ ...nextTripAction("paused", false) }, { type: "resume", label: "Resume" });
  assert.deepEqual({ ...nextTripAction("in_progress", false) }, { type: "start-gps", label: "Start GPS" });
  assert.deepEqual({ ...nextTripAction("in_progress", false, true) }, { type: "start-gps", label: "Start GPS" });
  assert.equal(nextTripAction("in_progress", true), null, "End Trip waits until the driver is near the site");
  assert.equal(nextTripAction("in_progress", true, false), null);
  assert.deepEqual({ ...nextTripAction("in_progress", true, true) }, { type: "end", label: "End Trip" });
  assert.equal(nextTripAction("completed", true), null);
  assert.equal(nextTripAction("cancelled", false), null);
});

test("summary shows distance, arrival and stage, and never claims a stage it lacks", () => {
  const live = liveTripSummary({
    tripId: 16, status: "in_progress", remainingKm: 0.7, arrivalTime: "6:30 pm", note: null,
  });
  assert.equal(live.primary, "0.7 km \u00b7 Arrive 6:30 pm");
  assert.equal(live.secondary, "In progress");
  const noGps = liveTripSummary({
    tripId: 16, status: "in_progress", remainingKm: null, arrivalTime: null, note: "GPS not started",
  });
  assert.equal(noGps.primary, "Distance updating");
  assert.equal(noGps.secondary, "In progress \u00b7 GPS not started");
  const pending = liveTripSummary({
    tripId: 16, status: "pending", remainingKm: 5, arrivalTime: "6:30 pm", note: null,
  });
  assert.equal(pending.primary, "Trip #16");
  assert.equal(pending.secondary, "Pending");
  assert.equal(liveTripSummary({
    tripId: 16, status: "paused", remainingKm: 2, arrivalTime: null, note: null,
  }).secondary, "Paused");
  const stale = liveTripSummary({
    tripId: 16, status: "in_progress", remainingKm: 0.7, arrivalTime: "11:09 pm", arrivalStale: true, note: null,
  });
  assert.equal(stale.primary, "0.7 km \u00b7 ETA outdated");
  assert.doesNotMatch(stale.primary, /11:09/);
});

test("a trip opened from the list shows its own stage, and the sound toggle is a round tappable icon", () => {
  const { tripStatusLabel } = load("lib/liveTripSummary.ts");
  assert.equal(tripStatusLabel("in_progress"), "In progress");
  assert.equal(tripStatusLabel("pending"), "Pending");
  const main = fs.readFileSync(path.join(root, "src", "components", "MainApp.tsx"), "utf8");
  assert.match(main, /summaryDetail = tripStatusLabel\(viewedTrip\.status\)/);
  const toggle = fs.readFileSync(path.join(root, "src", "components", "DriverVoiceToggle.tsx"), "utf8");
  assert.match(toggle, /flex h-12 w-12 items-center justify-center rounded-full border/);
  assert.match(toggle, /aria-label=\{enabled \? "Mute driver voice updates" : "Enable driver voice updates"\}/);
  assert.match(toggle, /title=\{enabled \? "Sound on" : "Sound off"\}/);
  assert.doesNotMatch(toggle, /bg-primary text-on-primary/, "not a loud filled control");
  assert.doesNotMatch(toggle, /Tap Sound on to retry/, "the message no longer names a label that does not exist");
});

test("near-site check uses the 300 m radius and treats an unknown position as not near", () => {
  const { isNearSite, NEAR_SITE_M } = load("lib/nearSite.ts");
  const site = { end_lat: 17.9781, end_lng: 79.51198 };
  assert.equal(NEAR_SITE_M, 300);
  assert.equal(isNearSite([17.9781, 79.51198], site), true);
  assert.equal(isNearSite([17.9781 + 0.0025, 79.51198], site), true, "about 278 m");
  assert.equal(isNearSite([17.9781 + 0.0035, 79.51198], site), false, "about 389 m");
  assert.equal(isNearSite(null, site), false);
  assert.equal(isNearSite(undefined, site), false);
});

test("an ETA is stale only after it has passed by more than the grace period", () => {
  const { isEtaStale } = load("lib/time.ts");
  const eta = "2026-10-11T17:39:00Z";
  const at = Date.parse(eta);
  assert.equal(isEtaStale(eta, at - 1), false);
  assert.equal(isEtaStale(eta, at + 60_000), false);
  assert.equal(isEtaStale(eta, at + 60_001), true);
  assert.equal(isEtaStale("2026-10-11T17:39:00", at + 3_600_000), true, "zone-less backend time is UTC");
  assert.equal(isEtaStale(null, at), false);
  assert.equal(isEtaStale("not a date", at), false);
});

function tripPanel() {
  const slots = [];
  const calls = { formOpen: 0, resumed: 0, updated: [] };
  let index = 0;
  let effects = [];
  const reactMock = {
    ...React,
    useState(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = { value: initial };
      return [slots[slot].value, (next) => { slots[slot].value = next; }];
    },
    useRef(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = { current: initial };
      return slots[slot];
    },
    useEffect(callback, deps) {
      const slot = index++;
      const previous = slots[slot];
      if (!previous || !deps || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) effects.push(callback);
      slots[slot] = { deps };
    },
  };
  const { default: Component } = load("components/TripManagement.tsx", {
    react: reactMock,
    "@/lib/api": { resumeTrip: async (id) => { calls.resumed += 1; return { id, status: "in_progress" }; } },
    "./Toast": { showToast() {} },
    "./TruckIcon": { default: () => null },
    "@/lib/nearSite": { isNearSite: () => false },
    "@/lib/completionReasons": load("lib/completionReasons.ts"),
    "@/lib/time": {
      timeZoneForTrip: () => "Asia/Kolkata", formatInZone: () => "6:30 pm",
      zoneLabel: () => "IST", zonedInputToUtcIso: () => "", isEtaStale: () => false,
    },
  });
  const render = (status, actionRequest) => {
    index = 0;
    effects = [];
    Component({
      trip: { id: 16, status, start_address: "A", end_address: "B", end_lat: 1, end_lng: 2, reroute_count: 0 },
      actionRequest,
      onTripUpdated: (trip) => calls.updated.push(trip),
      driverControls: {
        gpsState: "idle", gpsError: null, remainingKm: 1, onStartGps() {}, onFormOpen: () => { calls.formOpen += 1; },
      },
    });
    effects.forEach((effect) => effect());
  };
  return { render, calls };
}

test("header requests open the matching form or resume once, and only for the matching stage", async () => {
  const stale = tripPanel();
  stale.render("pending", { type: "begin", id: 1 });
  assert.equal(stale.calls.formOpen, 0, "a request already present at mount is not replayed");

  const begin = tripPanel();
  begin.render("pending", null);
  begin.render("pending", { type: "begin", id: 1 });
  assert.equal(begin.calls.formOpen, 1);
  begin.render("pending", { type: "begin", id: 1 });
  assert.equal(begin.calls.formOpen, 1, "the same request is handled once");
  begin.render("pending", { type: "begin", id: 2 });
  assert.equal(begin.calls.formOpen, 2);

  const end = tripPanel();
  end.render("in_progress", null);
  end.render("in_progress", { type: "end", id: 1 });
  assert.equal(end.calls.formOpen, 1);

  const mismatched = tripPanel();
  mismatched.render("in_progress", null);
  mismatched.render("in_progress", { type: "begin", id: 1 });
  mismatched.render("in_progress", { type: "resume", id: 2 });
  assert.equal(mismatched.calls.formOpen, 0);
  assert.equal(mismatched.calls.resumed, 0);

  const resume = tripPanel();
  resume.render("paused", null);
  resume.render("paused", { type: "resume", id: 1 });
  resume.render("paused", { type: "resume", id: 1 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(resume.calls.resumed, 1);
  assert.equal(resume.calls.updated.length, 1);
});

test("header and collapsed bar both show the summary line, stage and one separate action button", () => {
  const source = fs.readFileSync(path.join(root, "src", "components", "MainApp.tsx"), "utf8");
  assert.equal((source.match(/\{headerActionButton\}/g) ?? []).length, 2);
  assert.equal((source.match(/\{summaryDetail \?\? trafficMsg\}/g) ?? []).length, 2);
  assert.match(source, /actionRequest=\{actionRequest\}/);
  const pill = source.slice(source.indexOf('aria-label="Show details"'));
  const toggleEnd = pill.indexOf("</button>");
  assert.ok(pill.indexOf("{headerActionButton}") > toggleEnd, "action is a sibling of the toggle, not nested in it");
  const header = source.slice(source.indexOf("lg:hidden flex h-16"), source.indexOf("Shrink panel"));
  assert.ok(header.indexOf("{headerActionButton}") > header.indexOf("</button>"));
  assert.match(source, /flex min-h-12 flex-shrink-0 items-center whitespace-nowrap px-1/);
  assert.match(source, /action\.type === "end" \? "border border-primary text-primary"/);
  assert.doesNotMatch(source, /\{!headerAction && \(/, "the expand chevron stays visible next to the action");
  assert.match(pill.slice(0, toggleEnd), /M6 15l6-6 6 6/, "the collapsed bar keeps its expand chevron inside the toggle");
});
