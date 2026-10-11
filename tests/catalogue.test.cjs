const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function loadSource(relative, globals = {}) {
  const filename = path.join(__dirname, "..", relative);
  const source = fs.readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, URLSearchParams, performance,
    process: { env: { NODE_ENV: "production" } },
    console: { log() {}, error() {} },
    require(id) {
      if (id.startsWith("@/")) return loadSource(path.join("src", `${id.slice(2)}.ts`), globals);
      return require(id);
    },
    ...globals,
  }, { filename });
  return module.exports;
}

function client(responses) {
  const calls = [];
  const api = loadSource(path.join("src", "lib", "api.ts"), {
    window: { Clerk: { session: { getToken: async () => "test-session" } } },
    fetch: async (url, init) => {
      calls.push({ url, ...init });
      const result = responses.shift();
      assert.ok(result, `Unexpected request: ${url}`);
      return { ok: result.status < 400, status: result.status,
        json: async () => result.body, text: async () => result.status === 204 ? "" : JSON.stringify(result.body) };
    },
  });
  return { api, calls };
}

const page = (items, total = items.length, offset = 0) => ({ items, total, limit: 100, offset });

test("business organization picker displays membership names, IDs only as values, and pagination", () => {
  const picker = loadSource(path.join("src", "components", "BusinessOrganizationPicker.tsx"), {
    require(id) {
      if (id === "@clerk/nextjs") return {
        useOrganizationList(options) {
          assert.equal(options.userMemberships.infinite, true);
          return { isLoaded: true, userMemberships: {
            data: [{ organization: { id: "org_existing", name: "Concrete Company", slug: "concrete-company" } }],
            hasNextPage: true, isLoading: false, isError: false,
          } };
        },
      };
      return require(id);
    },
  }).default;
  let selected;
  const props = { value: "", disabled: false, onSelect: (...args) => { selected = args; } };
  const markup = renderToStaticMarkup(React.createElement(picker, props));
  assert.match(markup, /value="org_existing">Concrete Company</);
  assert.doesNotMatch(markup, /concrete-company/);
  assert.match(markup, /Load more organizations/);
  const tree = picker(props);
  const select = tree.props.children[0].props.children[1];
  select.props.onChange({ target: { value: "org_existing" } });
  assert.deepEqual(selected, ["org_existing", "Concrete Company"]);
});

test("business organization picker surfaces empty, loading, and error states", () => {
  for (const [state, message] of [
    [{ isLoading: true }, /Loading organizations/],
    [{}, /You do not belong to any Clerk organizations/],
    [{ isError: true }, /Could not load your organization memberships/],
  ]) {
    const picker = loadSource(path.join("src", "components", "BusinessOrganizationPicker.tsx"), {
      require(id) {
        if (id === "@clerk/nextjs") return { useOrganizationList: () => ({
          isLoaded: true, userMemberships: { data: [], ...state },
        }) };
        return require(id);
      },
    }).default;
    assert.match(renderToStaticMarkup(React.createElement(picker, {
      value: "", disabled: false, onSelect() {},
    })), message);
  }
});

test("geography pages respect the 100-record limit and parent filters", async () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ id: `state_${i}` }));
  const { api, calls } = client([
    { status: 200, body: page(rows, 101) },
    { status: 200, body: page([{ id: "last" }], 101, 100) },
    { status: 200, body: page([]) },
  ]);
  assert.equal((await api.getStates("IN")).length, 101);
  assert.match(calls[0].url, /country_code=IN&limit=100&offset=0$/);
  assert.match(calls[1].url, /offset=100$/);
  await api.getCities("state_1");
  assert.match(calls[2].url, /state_id=state_1/);
  assert.equal(calls[0].headers.Authorization, "Bearer test-session");
});

test("legacy arrays and incomplete pagination are rejected", async () => {
  for (const body of [[], { items: [] }]) {
    const { api } = client([{ status: 200, body }]);
    await assert.rejects(api.getCountries(), /Invalid catalogue response/);
  }
  const { api } = client([{ status: 200, body: page([], 1) }]);
  await assert.rejects(api.getCountries(), /pagination stopped/);
});

test("geography creates omit idempotency; region retries retain the key", async () => {
  const { api, calls } = client(Array.from({ length: 5 }, () => ({ status: 201, body: {} })));
  await api.createCountry({ organization_id: "org_company", code: "IN", name: "India" });
  await api.createState({ organization_id: "org_company", country_code: "IN", name: "Telangana" });
  await api.createCity({ state_id: "state_1", name: "Warangal", timezone: "Asia/Kolkata" });
  const body = { city_id: "city_1", name: "Warangal operating area" };
  await api.createRegion(body, "same-intent");
  await api.createRegion(body, "same-intent");
  for (const call of calls.slice(0, 3)) assert.equal(call.headers["Idempotency-Key"], undefined);
  assert.equal(calls[3].headers["Idempotency-Key"], "same-intent");
  assert.equal(calls[4].body, calls[3].body);
  assert.deepEqual(JSON.parse(calls[2].body), { state_id: "state_1", name: "Warangal", timezone: "Asia/Kolkata" });
});

test("region updates supply all editable fields and the read version", async () => {
  const { api, calls } = client([{ status: 200, body: {} }]);
  const body = { city_id: "city_1", name: "Renamed", version: 3 };
  await api.updateRegion("legacy region", body);
  assert.match(calls[0].url, /regions\/legacy%20region$/);
  assert.equal(calls[0].method, "PATCH");
  assert.deepEqual(JSON.parse(calls[0].body), body);
});

test("nested conflicts distinguish version and duplicate errors", async () => {
  for (const code of ["VERSION_CONFLICT", "DUPLICATE_NAME"]) {
    const { api } = client([{ status: 409, body: { detail: { code, message: "Conflict", details: { current_version: 3 } } } }]);
    await assert.rejects(api.getCountries(), (error) => {
      assert.equal(error.message, "Conflict");
      assert.equal(error.details.current_version, 3);
      assert.equal(api.isVersionConflict(error), code === "VERSION_CONFLICT");
      return true;
    });
  }
});

test("FastAPI field validation retains nested field locations", async () => {
  const { api } = client([{ status: 422, body: { detail: [{ loc: ["body", "location", "latitude"], msg: "Out of range" }] } }]);
  await assert.rejects(api.getCountries(), (error) => {
    assert.equal(error.fieldErrors["location.latitude"], "Out of range");
    return true;
  });
});

test("plant map mapping preserves structured geography and rejects legacy shape", () => {
  const { api } = client([]);
  const input = { id: "plant_1", brand_id: "brand_1", region_id: "region_1", version: 1,
    city_id: "city_1", state_id: "state_1", country_code: "IN", timezone: "Asia/Kolkata",
    calibration_status: "uncalibrated", location: { latitude: 17.9, longitude: 79.5 } };
  const result = api.normalizePlant(input);
  assert.equal(result.lat, 17.9);
  assert.equal(result.city_id, "city_1");
  assert.equal(result.timezone, "Asia/Kolkata");
  assert.equal(result.location, undefined);
  assert.throws(() => api.normalizePlant({ ...input, location: undefined, lat: 17.9, lng: 79.5 }), /Invalid structured/);
});

test("selectors show only children of selected parents and hide unlinked regions", () => {
  const { default: Selectors } = loadSource(path.join("src", "components", "GeographySelectors.tsx"));
  const markup = renderToStaticMarkup(React.createElement(Selectors, {
    catalogue: {
      countries: [{ code: "IN", name: "India" }],
      states: [{ id: "s1", country_code: "IN", name: "Telangana" }, { id: "s2", country_code: "NZ", name: "Hidden state" }],
      cities: [{ id: "c1", state_id: "s1", name: "Warangal" }, { id: "c2", state_id: "s2", name: "Hidden city" }],
      regions: [{ id: "r1", city_id: "c1", name: "Selected region" }, { id: "r2", city_id: null, name: "Unlinked region" }],
    },
    value: { countryCode: "IN", stateId: "s1", cityId: "c1", regionId: "r1" },
    onChange() {},
  }));
  assert.match(markup, /Telangana/);
  assert.match(markup, /Warangal/);
  assert.match(markup, /Selected region/);
  assert.doesNotMatch(markup, /Hidden state|Hidden city|Unlinked region/);
});

test("navigation uses backend capabilities, not Clerk admin role", () => {
  const { availableTabs } = loadSource(path.join("src", "lib", "access.ts"));
  const company = { organization_role: "org:admin", is_platform_admin: false,
    can_manage_businesses: false, can_manage_catalogue: false, can_operate_trips: true };
  assert.equal(JSON.stringify(availableTabs(company)), JSON.stringify(["dispatch", "trip", "trips", "plants"]));
  const owner = { organization_id: null, organization_role: null, is_platform_admin: true,
    can_manage_businesses: true, can_manage_catalogue: true, can_operate_trips: false };
  assert.equal(JSON.stringify(availableTabs(owner)), JSON.stringify(["businesses", "plants"]));
  assert.equal(availableTabs({ ...company, can_operate_trips: false }).length, 0);
});

test("catalogue create helpers send backend writes, ownership, and nested plant coordinates", async () => {
  const plant = { id: "plant_1", brand_id: "brand_1", region_id: "region_1", version: 1,
    location: { latitude: 17.9, longitude: 79.5 } };
  const { api, calls } = client([
    { status: 201, body: { id: "org_company", name: "Company" } },
    { status: 201, body: { id: "brand_1", name: "Brand" } },
    { status: 201, body: { id: "region_1", name: "Region" } },
    { status: 201, body: plant },
  ]);
  await api.createBusiness({ id: "org_company", name: "Company" }, "business-intent");
  await api.createBrand({ name: "Brand", organization_id: "org_company" }, "brand-intent");
  await api.createRegion({ name: "Region", city_id: "city_1" }, "region-intent");
  await api.createPlant({ name: "Plant", brand_id: "brand_1", region_id: "region_1",
    address: "Plant address", location: plant.location, active: true, supported_mix_codes: ["GP"] }, "plant-intent");
  assert.deepEqual(calls.map((call) => call.url), ["/api/v1/businesses", "/api/v1/brands", "/api/v1/regions", "/api/v1/plants"]);
  assert.ok(calls.every((call) => call.method === "POST" && call.headers["Idempotency-Key"]));
  assert.equal(JSON.parse(calls[1].body).organization_id, "org_company");
  assert.deepEqual(JSON.parse(calls[3].body).location, plant.location);
});

test("brand form notifies sibling catalogue only after a successful backend save", async () => {
  for (const fails of [false, true]) {
    let stateIndex = 0;
    let changed = 0;
    const writes = [];
    const Panel = loadSource(path.join("src", "components", "BrandsPanel.tsx"), {
      require(id) {
        if (id === "react") return { ...React,
          useState: () => [[[], false, "", null, ""][stateIndex++], () => {}],
          useCallback: (callback) => callback, useEffect() {},
        };
        if (id === "@/lib/api") return {
          async createBrand(body, key) {
            writes.push({ body, key });
            if (fails) throw new Error("Backend rejected save");
            return { id: "brand_1", ...body };
          },
          getBrands: async () => [], isVersionConflict: () => false,
        };
        if (id === "@/components/CatalogueNameForm") return { default: () => null };
        return require(id);
      },
    }).default;
    const tree = Panel({ business: { id: "org_company", name: "Company" }, onChanged: () => changed++ });
    const form = tree.props.children.find((child) => child && child.props && child.props.onSave);
    assert.ok(form);
    const saving = form.props.onSave("Brand", "", "same-intent");
    if (fails) await assert.rejects(saving, /Backend rejected/);
    else await saving;
    assert.equal(changed, fails ? 0 : 1);
    assert.equal(writes[0].body.organization_id, "org_company");
    assert.equal(writes[0].key, "same-intent");
  }
});

test("empty geography selector explains missing records instead of a silent blank list", () => {
  const Selectors = loadSource(path.join("src", "components", "GeographySelectors.tsx")).default;
  const markup = renderToStaticMarkup(React.createElement(Selectors, {
    catalogue: { countries: [], states: [], cities: [], regions: [] },
    value: { countryCode: "", stateId: "", cityId: "", regionId: "" }, onChange() {},
  }));
  assert.match(markup, /No country records available/);
  assert.match(markup, /Add the missing location in Business Geography/);
});

test("unused geography DELETE accepts empty 204 responses and encodes identifiers", async () => {
  const { api, calls } = client(Array.from({ length: 4 }, () => ({ status: 204 })));
  for (const kind of ["country", "state", "city", "region"]) {
    await api.deleteGeography(kind, "record with spaces", "org_company");
  }
  assert.deepEqual(calls.map((call) => call.url), [
    "/api/v1/countries/record%20with%20spaces?organization_id=org_company",
    "/api/v1/states/record%20with%20spaces",
    "/api/v1/cities/record%20with%20spaces",
    "/api/v1/regions/record%20with%20spaces",
  ]);
  assert.ok(calls.every((call) => call.method === "DELETE" && !call.body));
});

test("geography DELETE retains the backend reference conflict reason", async () => {
  const { api } = client([{ status: 409, body: { detail: {
    code: "GEOGRAPHY_IN_USE", message: "Region is referenced by an inactive plant",
  } } }]);
  await assert.rejects(api.deleteGeography("region", "region_1"), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.message, "Region is referenced by an inactive plant");
    return true;
  });

});

test("geography reference contains India and New Zealand with distinct subdivision types", () => {
    const reference = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "data", "geography-reference.json"), "utf8"));
    assert.deepEqual(reference.countries.map((country) => country.code), ["IN", "NZ"]);
    const [india, nz] = reference.countries;
    assert.equal(india.states.length, 28);
    assert.deepEqual(india.cities_by_state.Telangana, ["Warangal", "Hyderabad"]);
    for (const state of Object.keys(india.cities_by_state)) {
      assert.ok(india.states.includes(state));
    }
    assert.equal(india.union_territories.length, 8);
    assert.equal(nz.administrative_regions.length, 16);
    const auckland = nz.localities_by_region.Auckland;
    assert.equal(new Set(auckland).size, auckland.length);
    for (const name of ["Auckland", "Warkworth", "Wellsford", "Pukekohe", "Waiuku", "Helensville"]) {
      assert.ok(auckland.includes(name));
    }
    for (const name of nz.locality_coverage.Auckland.excluded_neighbouring_localities) {
      assert.ok(!auckland.includes(name));
    }
    assert.equal(nz.locality_coverage.Auckland.complete, false);
    for (const region of Object.keys(nz.localities_by_region)) {
      assert.ok(nz.administrative_regions.includes(region));
    }
    assert.deepEqual(nz.separate_territories, ["Chatham Islands"]);
    for (const list of [india.states, india.union_territories, nz.administrative_regions]) {
      assert.equal(new Set(list).size, list.length);
    }
});

test("business geography reads target opened business and country detail uses composite scope", async () => {
  const { api, calls } = client([
    ...Array.from({ length: 4 }, () => ({ status: 200, body: page([]) })),
    { status: 200, body: { code: "IN", organization_id: "org_opened" } },
  ]);
  await api.getCountries("org_opened");
  await api.getStates("IN", "org_opened");
  await api.getCities("state_opened", "org_opened");
  await api.getRegions("IN", "org_opened");
  await api.getCountry("IN", "org_opened");
  assert.ok(calls.every((call) => call.url.includes("organization_id=org_opened")));
  assert.match(calls[1].url, /country_code=IN/);
  assert.match(calls[2].url, /state_id=state_opened/);
  assert.equal(calls[4].url, "/api/v1/countries/IN?organization_id=org_opened");
});

test("geography forms submit opened business ownership, with child ownership inherited", async () => {
  for (const kind of ["country", "state", "city", "region"]) {
    let index = 0;
    const calls = [];
    const states = [kind, null,
      { countryCode: "IN", stateId: "state_opened", cityId: "city_opened", regionId: "" },
      "Example", "IN", "Asia/Kolkata", "", false, "", false, false, null, "", false];
    const Panel = loadSource(path.join("src", "components", "GeographyPanel.tsx"), {
      crypto: { randomUUID: () => "intent" },
      require(id) {
        if (id === "react") return { ...React,
          useState: () => [states[index++], () => {}],
          useRef: () => ({ current: null }),
        };
        if (id === "@/lib/api") return {
          ApiError: class extends Error {},
          ...Object.fromEntries(["Country", "State", "City", "Region"].map((type) => [
            `create${type}`, async (body) => { calls.push(body); },
          ])),
        };
        if (id === "@/components/GeographySelectors") return { default: () => null };
        return require(id);
      },
    }).default;
    const tree = Panel({ organizationId: "org_opened",
      catalogue: { countries: [], states: [], cities: [], regions: [] }, onRefresh: async () => {} });
    const modal = tree.props.children.find((child) => child?.props?.children?.props?.onSubmit);
    assert.ok(modal);
    await modal.props.children.props.onSubmit({ preventDefault() {} });
    assert.equal(calls.length, 1);
    if (kind === "country" || kind === "state") assert.equal(calls[0].organization_id, "org_opened");
    else assert.equal(calls[0].organization_id, undefined);
    if (kind === "city") assert.equal(calls[0].state_id, "state_opened");
    if (kind === "region") assert.equal(calls[0].city_id, "city_opened");
  }
});

test("country deletion refuses missing business scope without sending a request", async () => {
  const { api, calls } = client([]);
  await assert.rejects(api.deleteGeography("country", "IN"), /Select a business/);
  assert.equal(calls.length, 0);
});

test("plant catalogue remounts for business scope and discards pending loads after unmount", async () => {
  const effects = [];
  const calls = [];
  const pending = [];
  let setters = 0;
  const Panel = loadSource(path.join("src", "components", "PlantsPanel.tsx"), {
    localStorage: { getItem: () => "[]" },
    require(id) {
      if (id === "react") return { ...React,
        useState: (initial) => [initial, () => setters++],
        useCallback: (callback) => callback,
        useRef: (initial) => ({ current: initial }),
        useEffect: (effect) => effects.push(effect),
      };
      if (id === "@/lib/api") return Object.fromEntries(
        ["getPlants", "getBrands", "getRegions", "getCountries", "getStates", "getCities"].map((name) => [
          name, (...args) => {
            calls.push({ name, args });
            return new Promise((resolve) => pending.push(resolve));
          },
        ]),
      );
      if (id.startsWith("@/components/")) return { default: () => null, showToast() {} };
      return require(id);
    },
  }).default;
  const first = Panel({ canManage: true, organizationId: "org_first" });
  const second = Panel({ canManage: true, organizationId: "org_second" });
  assert.notEqual(first.key, second.key);
  first.type(first.props);
  const cleanup = effects[0]();
  assert.equal(calls[0].args[0].organizationId, "org_first");
  assert.equal(calls.find((call) => call.name === "getCountries").args[0], "org_first");
  assert.equal(calls.find((call) => call.name === "getStates").args[1], "org_first");
  assert.equal(calls.find((call) => call.name === "getCities").args[1], "org_first");
  assert.equal(calls.find((call) => call.name === "getRegions").args[1], "org_first");
  cleanup();
  const before = setters;
  pending.forEach((resolve) => resolve([]));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(setters, before, "An unmounted business must not apply stale catalogue results");
});
