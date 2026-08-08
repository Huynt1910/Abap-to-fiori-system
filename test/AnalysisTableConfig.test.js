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
    }
  };

  vm.runInNewContext(source, context, { filename: filePath });
  return exported;
}

const root = path.resolve(__dirname, "..");
const Constants = loadUi5Module(path.join(root, "webapp", "util", "Constants.js"));
const TechnicalFields = loadUi5Module(path.join(root, "webapp", "config", "TechnicalFields.js"));
const TableStateSanitizer = loadUi5Module(path.join(root, "webapp", "util", "TableStateSanitizer.js"), {
  "abap/to/fiori/system/config/TechnicalFields": TechnicalFields
});
const AnalysisTableConfig = loadUi5Module(path.join(root, "webapp", "model", "AnalysisTableConfig.js"), {
  "abap/to/fiori/system/util/Constants": Constants,
  "abap/to/fiori/system/config/TechnicalFields": TechnicalFields,
  "abap/to/fiori/system/util/TableStateSanitizer": TableStateSanitizer
});

test("analysis table registry covers every configured metadata field once", () => {
  [
    "sourceObjects",
    "uiFilters",
    "databaseObjects",
    "businessLogic",
    "alvOutputs",
    "alvColumns",
    "alvSorts",
    "alvFilters",
    "alvEvents",
    "recommendations",
    "annotations",
    "evidences",
    "messages"
  ].forEach((section) => {
    const registryFields = AnalysisTableConfig.getConfig(section).fields.map((field) => field.key);
    const uniqueFields = new Set(registryFields);

    assert.equal(uniqueFields.size, registryFields.length, `${section} has duplicate registry fields`);
    assert.equal(
      registryFields.slice().sort().join(","),
      Array.from(Constants.field[section]).sort().join(","),
      `${section} registry does not match metadata field list`
    );
  });
});

test("analysis table registry applies P1 visible and P2/P3 hidden defaults", () => {
  Object.keys(AnalysisTableConfig.configs).forEach((section) => {
    const defaults = AnalysisTableConfig.getColumnDefaults(section);

    AnalysisTableConfig.getConfig(section).fields.forEach((field) => {
      if (field.personalizable === false || field.technical === true) {
        assert.equal(Object.prototype.hasOwnProperty.call(defaults, field.stateKey), false, `${section}.${field.key} should not be in personalization defaults`);
        return;
      }
      if (field.priority === "P1") {
        assert.equal(defaults[field.stateKey], true, `${section}.${field.key} should be visible`);
      } else {
        assert.equal(defaults[field.stateKey], false, `${section}.${field.key} should be hidden`);
      }
    });
  });
});

test("technical fields are excluded from personalization defaults and capabilities", () => {
  const blocked = ["AnalysisId", "ItemId", "OutputId", "RecommendationId", "EvidenceId", "SourceItemId", "RuleId", "StatementId", "SourceHash"];

  Object.keys(AnalysisTableConfig.configs).forEach((section) => {
    const defaults = AnalysisTableConfig.getColumnDefaults(section);
    const personalizable = AnalysisTableConfig.getPersonalizableFields(section).map((field) => field.key);
    const config = AnalysisTableConfig.getConfig(section);
    const state = TableStateSanitizer.sanitizeState({
      tableKey: config.tableKey,
      columns: blocked.map((key, index) => ({ key, visible: true, index })),
      sorters: blocked.map((key, index) => ({ key, descending: false, index })),
      groups: blocked.map((key, index) => ({ key, descending: false, index })),
      filters: blocked.map((key, index) => ({ key, operator: "EQ", value: "x", index }))
    }, config);

    blocked.forEach((field) => {
      assert.equal(personalizable.includes(field), false, `${section}.${field} must not be personalizable`);
      assert.equal(Object.prototype.hasOwnProperty.call(defaults, field.charAt(0).toLowerCase() + field.slice(1)), false, `${section}.${field} must not have a column default`);
    });
    assert.equal(state.columns.some((column) => blocked.includes(column.key)), false, `${section} columns must sanitize technical fields`);
    assert.equal(state.sorters.some((sorter) => blocked.includes(sorter.key)), false, `${section} sorters must sanitize technical fields`);
    assert.equal(state.groups.some((group) => blocked.includes(group.key)), false, `${section} groups must sanitize technical fields`);
    assert.equal(state.filters.some((filter) => blocked.includes(filter.key)), false, `${section} filters must sanitize technical fields`);
  });
});

test("exportable registry excludes technical P3 fields by default", () => {
  Object.keys(AnalysisTableConfig.configs).forEach((section) => {
    const defaults = AnalysisTableConfig.getColumnDefaults(section);
    const exportKeys = AnalysisTableConfig.getExportableFields(section, defaults).map((field) => field.key);

    AnalysisTableConfig.getConfig(section).fields
      .filter((field) => field.priority === "P3")
      .forEach((field) => assert.equal(exportKeys.includes(field.key), false, `${section}.${field.key} should not export by default`));
  });
});
