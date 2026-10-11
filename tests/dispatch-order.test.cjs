const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "src", "components", "DispatchPanel.tsx"), "utf8");

test("dispatch asks Country, Brand, Region, Mix, Plant, then the job site", () => {
  const at = (marker) => {
    const index = source.indexOf(marker);
    assert.ok(index > -1, `${marker} is present`);
    return index;
  };
  const order = [
    at("{/* Country */}"),
    at("{/* Brand */}"),
    at('id="dispatch-region"'),
    at("{/* Mix type"),
    at("{/* Plant"),
    at('label="JOB SITE ADDRESS"'),
  ];
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test("each field that narrows the plant list comes before the plant dropdown", () => {
  const plant = source.indexOf("{/* Plant");
  for (const filter of ["{/* Country */}", "{/* Brand */}", 'id="dispatch-region"', "{/* Mix type"]) {
    assert.ok(source.indexOf(filter) < plant, `${filter} comes before Plant`);
  }
  // The plant list is rebuilt from exactly these inputs, so they must all sit above it.
  assert.match(source, /getPlants\(\{ brandId: brand, regionId: regionId \|\| undefined, countryCode, activeOnly: true \}\)/);
  assert.match(source, /supported_mix_codes\.includes\(mix\)/);
  assert.match(source, /\}, \[brand, regionId, mix, countryCode\]\);/);
});

test("changing a field above the plant clears the chosen plant and any stale analysis", () => {
  const effect = source.slice(source.indexOf("// Active plants for the selected brand/region"));
  assert.match(effect.slice(0, 400), /setSelectedPlantId\(null\)/);
  assert.match(source, /onChange=\{\(e\) => \{ setRegionId\(e\.target\.value\); setAnalysis\(null\); setAnalysisKey\(""\); \}\}/);
  assert.match(source, /setRegionId\(""\);\s*setJobSite\(""\)/, "changing country clears the region and the job site");
});
