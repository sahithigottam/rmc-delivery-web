const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");

test("map endpoints use local illustrated markers with coordinate tips and address popups", () => {
  const filename = path.join(__dirname, "..", "src", "components", "MapView.tsx");
  const source = fs.readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const markers = [];
  const icons = [];
  const fits = [];
  let resize;
  const map = { removeLayer() {}, fitBounds(points, options) { fits.push({ points, options }); }, getSize: () => ({ y: 600 }) };
  const layer = () => ({
    addTo() { return this; },
    bindPopup(address) { this.address = address; return this; },
    getBounds() { return {}; },
  });
  const leaflet = {
    Icon: { Default: { prototype: {}, mergeOptions() {} } },
    map: () => map,
    tileLayer: layer,
    polyline: layer,
    latLngBounds: (points) => points,
    icon(options) { icons.push(options); return options; },
    divIcon: (options) => options,
    marker(coordinates, options) {
      const marker = { ...layer(), coordinates, options };
      markers.push(marker);
      return marker;
    },
  };
  let refIndex = 0;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    window: { matchMedia: () => ({ matches: false }) },
    ResizeObserver: class { constructor(callback) { resize = callback; } observe() {} disconnect() {} },
    require(id) {
      if (id === "leaflet") return { default: leaflet };
      if (id.endsWith(".css")) return {};
      if (id === "react") return {
        ...React,
        useEffect: (effect) => effect(),
        useRef: (value) => ({ current: refIndex++ === 0 ? {} : value }),
        useCallback: (callback) => callback,
      };
      if (id === "@/lib/polyline") return { decodePolyline: () => [[1, 2], [3, 4]] };
      return require(id);
    },
  }, { filename });
  module.exports.default({
    route: {
      id: 1, polyline: "test", start_lat: 1, start_lng: 2, end_lat: 3, end_lng: 4,
      resolved_start_address: "Batching plant", resolved_end_address: "Job site",
    },
    simState: "idle", truckPosition: null, animationPoints: [], currentPointIndex: 0,
  });
  assert.equal(markers.length, 2);
  for (const [index, name] of ["plant", "destination"].entries()) {
    assert.equal(icons[index].iconUrl, `/markers/${name}.svg`);
    assert.deepEqual(Array.from(icons[index].iconAnchor), [28, 62]);
    assert.deepEqual(Array.from(icons[index].iconSize), [56, 64]);
    const svg = fs.readFileSync(path.join(__dirname, "..", "public", "markers", `${name}.svg`), "utf8");
    assert.match(svg, /viewBox="0 0 56 64"/);
    assert.doesNotMatch(svg, /<script|<image|\bonload=/);
    assert.ok(markers[index].options.alt);
  }
  assert.deepEqual(Array.from(markers[0].coordinates), [1, 2]);
  assert.deepEqual(Array.from(markers[1].coordinates), [3, 4]);
  assert.equal(markers[0].address, "Batching plant");
  assert.equal(markers[1].address, "Job site");
  assert.equal(fits.at(-1).options.maxZoom, 16);
  assert.deepEqual(Array.from(fits.at(-1).options.paddingTopLeft), [36, 96]);
  assert.ok(fits.at(-1).points.some((point) => point[0] === 1 && point[1] === 2));
  assert.ok(fits.at(-1).points.some((point) => point[0] === 3 && point[1] === 4));
  assert.doesNotMatch(source, /Show .* on map|aria-label="Map view"/);
  map.invalidateSize = () => {};
  const count = fits.length;
  resize();
  assert.equal(fits.length, count + 1);
  refIndex = 0;
  module.exports.default({
    route: {
      id: 2, polyline: "test", start_lat: 1, start_lng: 2, end_lat: 3, end_lng: 4,
      resolved_start_address: "Batching plant", resolved_end_address: "Job site",
    },
    simState: "idle", truckPosition: [5, 6], animationPoints: [], currentPointIndex: 0,
    bottomInsetRatio: 0.55,
  });
  assert.ok(fits.at(-1).points.some((point) => point[0] === 5 && point[1] === 6));
  assert.equal(fits.at(-1).options.paddingBottomRight[1], 370);
  const fitsBeforeFullSheet = fits.length;
  refIndex = 0;
  module.exports.default({
    route: {
      id: 3, polyline: "test", start_lat: 1, start_lng: 2, end_lat: 3, end_lng: 4,
      resolved_start_address: "Batching plant", resolved_end_address: "Job site",
    },
    simState: "idle", truckPosition: null, animationPoints: [], currentPointIndex: 0,
    bottomInsetRatio: 1,
  });
  assert.equal(fits.length, fitsBeforeFullSheet);
});
