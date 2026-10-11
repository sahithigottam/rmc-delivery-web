const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");

function realLib(file) {
  const loaded = { exports: {} };
  vm.runInNewContext(ts.transpileModule(
    fs.readFileSync(path.join(__dirname, "..", "src", "lib", file), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText, { module: loaded, exports: loaded.exports });
  return loaded.exports;
}

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
  const views = [];
  const events = {};
  const map = {
    removeLayer() {},
    on(names, callback) { for (const name of names.split(" ")) events[name] = callback; },
    project: (position) => ({ x: position[1], y: position[0] }),
    unproject: (point) => point,
    setView(center, zoom) { views.push({ center, zoom }); },
    fitBounds(points, options) { fits.push({ points, options }); }, getSize: () => ({ y: 600 }),
  };
  const lines = [];
  const layer = () => ({
    addTo() { return this; },
    bindPopup(address) { this.address = address; return this; },
    getBounds() { return {}; },
  });

  test("driver following resumes ten seconds after exploration and uses the latest GPS fix", () => {
    const filename = path.join(__dirname, "..", "src", "components", "MapView.tsx");
    const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const hooks = [];
    let index = 0;
    let effects = [];
    const views = [];
    const events = {};
    const timers = new Map();
    let timerId = 0;
    const layer = () => ({
      addTo() { return this; }, bindPopup() { return this; }, setLatLng() {},
    });
    const map = {
      on(names, callback) { names.split(" ").forEach((name) => { events[name] = callback; }); },
      removeLayer() {}, fitBounds() {}, getSize: () => ({ y: 600 }),
      project: ([lat, lng]) => ({ x: lng, y: lat }),
      unproject: (point) => point,
      setView(center, zoom) {
        events.movestart?.();
        events.zoomstart?.();
        views.push({ center, zoom });
      },
    };
    const leaflet = {
      Icon: { Default: { prototype: {}, mergeOptions() {} } },
      map: () => map, tileLayer: layer, polyline: layer, marker: layer,
      icon: (options) => options, divIcon: (options) => options,
      point: (x, y) => ({ x, y }), latLngBounds: (points) => points,
    };
    const memo = (callback, deps) => {
      const slot = index++;
      const old = hooks[slot];
      if (!old || deps.some((dep, i) => !Object.is(dep, old.deps[i]))) {
        hooks[slot] = { deps, value: callback() };
      }
      return hooks[slot].value;
    };
    const module = { exports: {} };
    vm.runInNewContext(compiled, {
      module, exports: module.exports,
      setTimeout(callback, delay) {
        assert.equal(delay, 10000);
        timers.set(++timerId, callback);
        return timerId;
      },
      clearTimeout(id) { timers.delete(id); },
      window: { matchMedia: () => ({ matches: false }) },
      ResizeObserver: class { observe() {} disconnect() {} },
      require(id) {
        if (id === "leaflet") return { default: leaflet };
        if (id.endsWith(".css")) return {};
        if (id === "@/lib/nearSite") return realLib("nearSite.ts");
        if (id === "@/lib/polyline") return {
          decodePolyline: () => [[1, 2], [3, 4]], remainingRoute: (points) => ({ points }),
        };
        if (id === "react") return {
          ...React,
          useRef(value) {
            const slot = index++;
            if (!hooks[slot]) hooks[slot] = { current: slot === 0 ? {} : value };
            return hooks[slot];
          },
          useMemo: memo,
          useCallback: (callback, deps) => memo(() => callback, deps),
          useEffect(callback, deps) {
            memo(() => { effects.push(callback); return null; }, deps);
          },
        };
        return require(id);
      },
    }, { filename });
    const render = (followDriver, truckPosition) => {
      index = 0;
      effects = [];
      module.exports.default({
        route: null, simState: "idle", animationPoints: [], currentPointIndex: 0,
        bottomInsetRatio: 0.55, followDriver, truckPosition,
      });
      effects.forEach((effect) => effect());
    };
    render(false, null);
    events.movestart();
    render(true, [1, 2]);
    assert.equal(views.at(-1).zoom, 17);
    const firstCount = views.length;
    render(true, [1.1, 2.1]);
    assert.equal(views.length, firstCount + 1);
    assert.equal(views.at(-1).center.x, 2.1);
    events.movestart();
    render(true, [1.2, 2.2]);
    assert.equal(views.length, firstCount + 1);
    events.moveend();
    assert.equal(views.length, firstCount + 1);
    assert.equal(timers.size, 1);
    events.zoomstart();
    assert.equal(timers.size, 0);
    events.zoomend();
    render(true, [1.25, 2.25]);
    assert.equal(views.length, firstCount + 1);
    const [id, callback] = [...timers.entries()][0];
    timers.delete(id);
    callback();
    assert.equal(views.at(-1).center.x, 2.25);
    render(true, [1.2, 2.2]);
    assert.equal(views.at(-1).center.x, 2.2);
    events.movestart();
    events.moveend();
    render(false, null);
    assert.equal(timers.size, 0);
    render(true, [1.3, 2.3]);
    assert.equal(views.at(-1).center.x, 2.3);
  });
  const leaflet = {
    Icon: { Default: { prototype: {}, mergeOptions() {} } },
    map: () => map,
    tileLayer: layer,
    polyline(points, options) { lines.push({ points, options }); return layer(); },
    point: (x, y) => ({ x, y }),
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
        useMemo: (callback) => callback(),
      };
      if (id === "@/lib/nearSite") return realLib("nearSite.ts");
      if (id === "@/lib/polyline") return {
        decodePolyline: () => [[1, 2], [3, 4]],
        remainingRoute: (points) => ({ points, distanceKm: 1 }),
      };
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
  refIndex = 0;
  module.exports.default({
    route: {
      id: 4, polyline: "test", start_lat: 1, start_lng: 2, end_lat: 3, end_lng: 4,
      resolved_start_address: "Batching plant", resolved_end_address: "Job site",
    },
    simState: "running", truckPosition: [5, 6], animationPoints: [], currentPointIndex: 0,
    bottomInsetRatio: 0.55, followDriver: true, remainingPolyline: "remaining",
  });
  assert.equal(views.at(-1).zoom, 17);
  assert.equal(views.at(-1).center.y, 170);
  assert.ok(lines.some(({ options }) => options.color === "#b6a1dc"));
  assert.ok(lines.some(({ options }) => options.color === "#6750a4"));
  events.movestart();
  const beforeManualResize = views.length;
  resize();
  assert.equal(views.length, beforeManualResize);

  // Close to the site the map fits the driver and the site together, never zooming past 17
  const site = { id: 5, polyline: "test", start_lat: 1, start_lng: 2, end_lat: 3, end_lng: 4,
    resolved_start_address: "Batching plant", resolved_end_address: "Job site" };
  const render = (truckPosition, followDriver = true) => {
    refIndex = 0;
    return module.exports.default({
      route: site, simState: "running", truckPosition, animationPoints: [], currentPointIndex: 0,
      bottomInsetRatio: 0.55, followDriver,
    });
  };
  const fitsBeforeNear = fits.length;
  const viewsBeforeNear = views.length;
  render([3.0089, 4]); // about 990 m from the site
  assert.ok(fits.length > fitsBeforeNear, "fits both points when within 1 km");
  assert.equal(fits.at(-1).options.maxZoom, 17);
  assert.ok(fits.at(-1).points.some((point) => point[0] === 3.0089 && point[1] === 4));
  assert.ok(fits.at(-1).points.some((point) => point[0] === 3 && point[1] === 4));
  assert.equal(views.length, viewsBeforeNear, "no fixed close-up while the site is near");
  const fitsBeforeFar = fits.length;
  render([3.0091, 4]); // about 1,010 m away
  assert.equal(views.at(-1).zoom, 17, "beyond 1 km it follows the driver at the close-up zoom");
  assert.equal(fits.length, fitsBeforeFar);

  // The locate button returns to the driver at once, and only shows while following
  assert.equal(render([3.5, 4], false).props.children[1], false);
  assert.equal(render(null, true).props.children[1], null);
  const tree = render([3.5, 4]);
  const locate = tree.props.children[1];
  assert.equal(locate.type, "button");
  assert.equal(locate.props["aria-label"], "Re-centre on the driver");
  events.movestart(); // the driver explores the map, which pauses following
  const viewsBeforeTap = views.length;
  locate.props.onClick();
  assert.equal(views.length, viewsBeforeTap + 1);
  assert.equal(views.at(-1).zoom, 17);
});
