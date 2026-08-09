const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadUi5Module(filePath, dependencies = {}) {
  let exported;
  const source = fs.readFileSync(filePath, "utf8");
  const context = {
    sap: {
      ui: {
        define(deps, factory) {
          exported = factory(...deps.map((dep) => dependencies[dep]));
        }
      }
    },
    JSON
  };

  vm.runInNewContext(source, context, { filename: filePath });
  return exported;
}

class Filter {
  constructor(pathOrConfig, operator, value, value2) {
    Object.assign(this, typeof pathOrConfig === "object" ? pathOrConfig : { path: pathOrConfig, operator, value, value2 });
  }
}

class Sorter {
  constructor(pathValue, descending, group) {
    this.path = pathValue;
    this.descending = descending;
    this.group = group;
  }
}

function createStorage() {
  const data = {};
  return {
    getItem(key) { return data[key] || null; },
    setItem(key, value) { data[key] = value; },
    data
  };
}

const root = path.resolve(__dirname, "..");
const Constants = loadUi5Module(path.join(root, "webapp", "util", "Constants.js"));
const TechnicalFields = loadUi5Module(path.join(root, "webapp", "config", "TechnicalFields.js"));
const TableStateSanitizer = loadUi5Module(path.join(root, "webapp", "util", "TableStateSanitizer.js"), {
  "abap/to/fiori/system/config/TechnicalFields": TechnicalFields
});
const TablePersonalizationService = loadUi5Module(path.join(root, "webapp", "util", "TablePersonalizationService.js"), {
  "sap/ui/model/Filter": Filter,
  "sap/ui/model/FilterOperator": { Contains: "Contains", EQ: "EQ", BT: "BT" },
  "sap/ui/model/Sorter": Sorter,
  "abap/to/fiori/system/util/TableStateSanitizer": TableStateSanitizer
});
const AnalysisTableConfig = loadUi5Module(path.join(root, "webapp", "model", "AnalysisTableConfig.js"), {
  "abap/to/fiori/system/util/Constants": Constants,
  "abap/to/fiori/system/config/TechnicalFields": TechnicalFields,
  "abap/to/fiori/system/util/TableStateSanitizer": TableStateSanitizer
});

test("personalization service migrates stale local state and removes technical fields", () => {
  const storage = createStorage();
  const service = new TablePersonalizationService(storage);
  const config = AnalysisTableConfig.getConfig("recommendations");

  storage.setItem(service.getStorageKey(config.tableKey), JSON.stringify({
    schemaVersion: 1,
    tableKey: config.tableKey,
    columns: [{ key: "AnalysisId", visible: true, index: 0 }, { key: "Title", visible: true, index: 1 }],
    sorters: [{ key: "RuleId", descending: false }],
    groups: [{ key: "RecommendationId", descending: false }],
    filters: [{ key: "EvidenceId", operator: "EQ", value: "x" }]
  }));

  const state = service.loadState(config);

  assert.equal(state.schemaVersion, 2);
  assert.deepEqual(Array.from(state.columns.map((column) => column.key)), ["Title", "RuleVersion", "TargetLayer", "DisplayText", "Explanation", "Severity", "Confidence", "ReviewStatus", "ManualReview"]);
  assert.equal(state.sorters.length, 0);
  assert.equal(state.groups.length, 0);
  assert.equal(state.filters.length, 0);
  assert.match(storage.getItem(service.getStorageKey(config.tableKey)), /"schemaVersion":2/);
});

test("visible export fields follow sanitized column order and never include ids", () => {
  const service = new TablePersonalizationService(createStorage());
  const config = AnalysisTableConfig.getConfig("sourceObjects");
  const fields = service.getVisibleExportableFields(config, {
    columns: [
      { key: "AnalysisId", visible: true, index: 0 },
      { key: "LineCount", visible: true, index: 1 },
      { key: "ObjectName", visible: true, index: 2 },
      { key: "SourceHash", visible: true, index: 3 }
    ]
  });

  assert.deepEqual(Array.from(fields.map((field) => field.key)), ["LineCount", "ObjectName", "ObjectType", "ParentObject", "IncludeDepth"]);
});

test("sorters and filters are built from sanitized business fields", () => {
  const service = new TablePersonalizationService(createStorage());
  const sorters = service.buildSorters([{ key: "Status", descending: false }], [{ key: "ObjectType", descending: true }]);
  const filters = service.buildFilters([{ key: "ProgramName", operator: "Contains", value: "Z" }]);

  assert.deepEqual(JSON.parse(JSON.stringify(sorters.map((sorter) => [sorter.path, sorter.descending, sorter.group]))), [["ObjectType", true, true], ["Status", false, null]]);
  assert.equal(filters[0].path, "ProgramName");
  assert.equal(filters[0].operator, "Contains");
});
