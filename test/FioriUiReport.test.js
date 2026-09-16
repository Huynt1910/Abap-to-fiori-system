const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
function load(relativePath, dependencies = {}) {
  let exported;
  const file = path.join(root, relativePath);
  vm.runInNewContext(fs.readFileSync(file, "utf8"), {
    sap: { ui: { define(names, factory) {
      exported = factory(...names.map((name) => dependencies[name]));
    } } }, Promise
  }, { filename: file });
  return exported;
}
const project = load("webapp/util/FioriUiProject.js");
const reportConfig = load("webapp/util/FioriUiReportConfig.js", {
  "abap/to/fiori/system/util/FioriUiProject": project
});
const analysisId = "8b95f36a-4f27-1fe1-a4a6-40de08121663";
const serviceRootUrl = "/sap/opu/odata4/sap/demo/srvd/sap/demo/0001/";

function config(overrides = {}) {
  return {
    analysisId, serviceRootUrl, entitySet: "Products",
    columns: [{ property: "Name", label: "Config name" }, { property: "ID", label: "Config ID" }],
    filters: [{ property: "Category", kind: "SCALAR", operator: "EQ" }],
    defaultSort: [{ property: "ID", descending: true }], ...overrides
  };
}

function metadata() {
  return {
    container: {
      $kind: "EntityContainer",
      Products: { $kind: "EntitySet", $Type: "Demo.Service.Product" },
      Orders: { $kind: "EntitySet", $Type: "Demo.Service.Order" }
    },
    type: {
      $kind: "EntityType",
      ID: { $kind: "Property", $Type: "Edm.String" },
      Name: { $kind: "Property", $Type: "Edm.String", "@com.sap.vocabularies.Common.v1.Label": "Product name" },
      Category: { $kind: "Property", $Type: "Edm.String", "@Common.Label": "Category label" },
      Price: { $kind: "Property", $Type: "Edm.Decimal" },
      "@com.sap.vocabularies.UI.v1.LineItem": [
        { $Type: "com.sap.vocabularies.UI.v1.DataField", Value: { $Path: "ID" }, Label: "Product ID" },
        { $Type: "com.sap.vocabularies.UI.v1.DataField", Value: { $Path: "Name" } }
      ]
    }
  };
}

test("runtime metadata chooses the configured entity's LineItem, labels, scalar EQ filters and sort", () => {
  const selected = reportConfig.select(config(), metadata(), serviceRootUrl);
  assert.equal(selected.entitySet, "Products");
  assert.deepEqual(Array.from(selected.columns, (column) => [column.property, column.label]),
    [["ID", "Product ID"], ["Name", "Product name"]]);
  assert.deepEqual(Array.from(selected.filters, (filter) => [filter.property, filter.label, filter.supported]),
    [["Category", "Category label", true]]);
  assert.deepEqual(Array.from(selected.defaultSort, (sort) => [sort.property, sort.descending]), [["ID", true]]);

  const fallback = metadata();
  delete fallback.type["@com.sap.vocabularies.UI.v1.LineItem"];
  assert.deepEqual(Array.from(reportConfig.select(config(), fallback, serviceRootUrl).columns, (column) => column.property),
    ["Name", "ID"]);
});

test("invalid properties stop rendering and unsupported filter kinds are explicit", () => {
  for (const overrides of [
    { columns: [{ property: "Missing" }] },
    { filters: [{ property: "Missing" }] },
    { defaultSort: [{ property: "Missing" }] }
  ]) {
    assert.throws(() => reportConfig.select(config(overrides), metadata(), serviceRootUrl), /property|Column|Filter|DefaultSort/);
  }
  assert.throws(() => reportConfig.select(config({ entitySet: "Orders" }), {
    container: metadata().container,
    type: { $kind: "EntityType", OrderID: { $kind: "Property", $Type: "Edm.String" } }
  }, serviceRootUrl), /Column/);
  const selected = reportConfig.select(config({ filters: [
    { property: "Category", kind: "RANGE" },
    { property: "Price", kind: "SCALAR", operator: "EQ" },
    { property: "Category", kind: "SCALAR", operator: "EQ" }
  ] }), metadata(), serviceRootUrl);
  assert.equal(selected.filters[0].supported, false);
  assert.match(selected.filters[0].reason, /RANGE/);
  assert.equal(selected.filters[1].supported, false);
  assert.match(selected.filters[1].reason, /Edm.Decimal/);
  assert.equal(selected.filters[2].supported, true);
});

test("only proxy /sap roots and matching metadata URL can create the OData V4 model", () => {
  for (const url of ["https://sap.example/sap/report/", "//sap.example/report/", "/sap/../report/",
    "/sap//report/", "/sap/report/$metadata", "/sap/report/?foo=1", "/sapfoo/report/"]) {
    assert.throws(() => reportConfig.serviceUrl(url), /serviceRootUrl/);
  }
  assert.equal(reportConfig.serviceUrl(serviceRootUrl), serviceRootUrl);
  assert.equal(reportConfig.assertService(config(), serviceRootUrl), serviceRootUrl);
  assert.throws(() => reportConfig.assertService(config({ metadataUrl: "https://sap.example/$metadata" }),
    serviceRootUrl), /metadataUrl/);
  assert.throws(() => reportConfig.assertService(config({ serviceRootUrl: "/sap/other/" }),
    serviceRootUrl), /serviceRootUrl/);
});

function state(overrides = {}) {
  return {
    busy: false, hasResult: true, status: "CONFIG_READY", metadataStatus: "VALIDATED",
    metadataSignature: "current", serviceRootUrl, config: config(),
    configAnalysisId: analysisId, prepareAnalysisId: analysisId, ...overrides
  };
}

test("validation signature, route, Prepare and ConfigJson IDs reject stale reports", () => {
  assert.equal(reportConfig.assertCurrent(state(), analysisId, analysisId, "current"), serviceRootUrl);
  for (const [changedState, currentId, routeId, signature] of [
    [state(), analysisId, analysisId, "old"],
    [state({ metadataStatus: "INVALID" }), analysisId, analysisId, "current"],
    [state(), analysisId, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "current"],
    [state({ prepareAnalysisId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }), analysisId, analysisId, "current"],
    [state({ configAnalysisId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }), analysisId, analysisId, "current"],
    [state({ serviceRootUrl: "/sap/other/" }), analysisId, analysisId, "current"],
    [state(), "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", analysisId, "current"]
  ]) {
    assert.throws(() => reportConfig.assertCurrent(changedState, currentId, routeId, signature));
  }
});

class Model {
  constructor(data) { this.data = data; }
  getProperty(key) { return key.split("/").filter(Boolean).reduce((value, part) => value && value[part], this.data); }
  setProperty(key, value) {
    const parts = key.split("/").filter(Boolean);
    const last = parts.pop();
    parts.reduce((parent, part) => parent[part] || (parent[part] = {}), this.data)[last] = value;
  }
}

test("controller closes the old report and its async callback rejects a changed analysis or inputs", () => {
  let opens = 0;
  let closes = 0;
  let isCurrent;
  const definition = load("webapp/controller/AnalysisDetail.controller.js", {
    "abap/to/fiori/system/controller/BaseController": { extend(name, value) { return value; } },
    "abap/to/fiori/system/util/FioriUiReportConfig": reportConfig,
    "abap/to/fiori/system/util/FioriUiReport": { open(owner, url, settings, check) {
      opens += 1;
      assert.equal(url, serviceRootUrl);
      assert.equal(settings.entitySet, "Products");
      isCurrent = check;
      return { close() { closes += 1; } };
    } }
  });
  const instance = Object.assign({}, definition, {
    _oViewModel: new Model({ analysisId, fioriUi: state() }),
    _sCurrentRouteAnalysisId: analysisId
  });
  instance._oViewModel.setProperty("/fioriUi/metadataSignature", instance._fioriUiSignature());
  instance.onOpenFioriUiReport();
  assert.equal(opens, 1);
  assert.equal(isCurrent(), true);
  instance.onFioriUiInputChange({
    getSource() { return { getBinding() { return { getPath() { return "/fioriUi/targetPackage"; } }; } }; },
    getParameter() { return "Z_CHANGED"; }
  });
  assert.equal(closes, 1);
  assert.equal(isCurrent(), false);
  instance.onOpenFioriUiReport();
  assert.equal(opens, 1);
  instance._oViewModel.setProperty("/fioriUi", state({ targetPackage: "Z_UI" }));
  instance._oViewModel.setProperty("/fioriUi/metadataSignature", instance._fioriUiSignature());
  instance._oViewModel.setProperty("/analysisId", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  instance.onOpenFioriUiReport();
  assert.equal(opens, 1);
});

function reportUi(oRuntime = metadata(), oMetaFailure) {
  const created = [];
  const models = [];
  const metaPaths = [];
  const bindings = [];
  class Control {
    constructor(options = {}) { this.options = options; this.items = options.items || []; created.push(this); }
    addStyleClass() { return this; }
    addItem(item) { this.items.push(item); return this; }
    setText(value) { this.text = value; }
    setVisible(value) { this.visible = value; }
    getVisible() { return this.visible; }
    setBusy(value) { this.busy = value; }
    setModel(model) { this.model = model; }
    setEndButton(button) { this.endButton = button; }
    attachBeforeClose(fn) { this.beforeClose = fn; }
    attachAfterClose(fn) { this.afterClose = fn; }
    open() { this.opened = true; }
    close() { this.beforeClose(); this.afterClose(); }
    destroy() { this.destroyed = true; }
    getItems() { return this.items; }
    getValue() { return this.value || ""; }
    setValue(value) { this.value = value; }
    bindItems(bindingInfo) {
      this.bindingInfo = bindingInfo;
      this.binding = { filter(filters, type) { this.filters = filters; this.type = type; } };
      bindings.push({ serviceUrl: models[0].options.serviceUrl, groupId: models[0].options.groupId,
        path: bindingInfo.path });
    }
    getBinding() { return this.binding; }
  }
  class Table extends Control {}
  class Button extends Control {}
  class Input extends Control {}
  class MessageStrip extends Control {}
  class ODataModel {
    constructor(options) { this.options = options; models.push(this); }
    getMetaModel() { return { requestObject(key) {
      metaPaths.push(key);
      if (oMetaFailure) return Promise.reject(oMetaFailure);
      const entitySet = Object.keys(oRuntime.container).find((name) =>
        oRuntime.container[name] && oRuntime.container[name].$kind === "EntitySet" &&
        name !== "Orders") || "Products";
      const values = {
        "/$EntityContainer/": oRuntime.container,
        ["/" + entitySet + "/"]: oRuntime.type,
        ["/" + entitySet + "/@com.sap.vocabularies.UI.v1.LineItem"]: oRuntime.lineItem,
        ["/" + entitySet + "@com.sap.vocabularies.UI.v1.LineItem"]: undefined
      };
      return Promise.resolve(values[key]);
    } }; }
    destroy() { this.destroyed = true; }
  }
  class Filter {
    constructor(propertyName, operator, filterValue) { Object.assign(this, { propertyName, operator, filterValue }); }
  }
  class Sorter {
    constructor(propertyName, descending) { Object.assign(this, { propertyName, descending }); }
  }
  const common = {
    "sap/ui/model/odata/v4/ODataModel": ODataModel,
    "sap/ui/model/Filter": Filter,
    "sap/ui/model/FilterOperator": { EQ: "EQ" },
    "sap/ui/model/Sorter": Sorter,
    "sap/m/Dialog": Control, "sap/m/VBox": Control, "sap/m/HBox": Control,
    "sap/m/Label": Control, "sap/m/Input": Input, "sap/m/Button": Button,
    "sap/m/MessageStrip": MessageStrip, "sap/m/Text": Control,
    "sap/m/Column": Control, "sap/m/ColumnListItem": Control, "sap/m/Table": Table,
    "abap/to/fiori/system/util/FioriUiReportConfig": reportConfig
  };
  const report = load("webapp/util/FioriUiReport.js", common);
  const owner = { getText(key, args) { return key + (args ? " " + args.join(" ") : ""); },
    getView() { return { addDependent() {} }; } };
  return { report, owner, created, models, metaPaths, bindings, Table, Button, Input, MessageStrip };
}

test("valid V4 metadata binds the ConfigJson entity set on its report service with direct reads", async () => {
  const setName = "ZC_ZRMIG_SAMPLE_FM_ALV";
  const reportRoot = "/sap/opu/odata4/sap/zui_mig_shared_o4/srvd/sap/zui_mig_zrmig_sample_fm_alv/0001/";
  const runtime = metadata();
  runtime.container[setName] = runtime.container.Products;
  delete runtime.container.Products;
  runtime.lineItem = runtime.type["@com.sap.vocabularies.UI.v1.LineItem"];
  delete runtime.type["@com.sap.vocabularies.UI.v1.LineItem"];
  const ui = reportUi(runtime);
  const handle = ui.report.open(ui.owner, reportRoot,
    config({ serviceRootUrl: reportRoot, entitySet: setName }), () => true);
  await new Promise((resolve) => setImmediate(resolve));
  const table = ui.created.find((control) => control instanceof ui.Table);
  assert.equal(ui.models[0].options.serviceUrl, reportRoot);
  assert.equal(ui.models[0].options.operationMode, "Server");
  assert.deepEqual(ui.metaPaths, ["/$EntityContainer/", "/" + setName + "/",
    "/" + setName + "/@com.sap.vocabularies.UI.v1.LineItem",
    "/" + setName + "@com.sap.vocabularies.UI.v1.LineItem"]);
  assert.deepEqual(ui.bindings, [{ serviceUrl: reportRoot, groupId: "$direct", path: "report>/" + setName }]);
  assert.equal(table.options.growing, true);
  assert.equal(table.options.growingThreshold, 30);
  assert.equal(table.bindingInfo.path, "report>/" + setName);
  assert.equal(table.bindingInfo.sorter[0].propertyName, "ID");
  assert.equal(table.bindingInfo.sorter[0].descending, true);
  ui.created.find((control) => control instanceof ui.Input).setValue("A");
  ui.created.find((control) => control instanceof ui.Button &&
    control.options.text === "fioriUiReportSearch").options.press();
  assert.equal(table.binding.type, "Application");
  assert.deepEqual(Array.from(table.binding.filters, (filter) =>
    [filter.propertyName, filter.operator, filter.filterValue]), [["Category", "EQ", "A"]]);
  table.bindingInfo.events.dataRequested();
  assert.equal(table.busy, true);
  table.bindingInfo.events.dataReceived({ getParameter() { return { status: 500, message: "Server error" }; } });
  assert.equal(table.busy, false);
  const error = ui.created.find((control) => control instanceof ui.MessageStrip);
  assert.equal(error.visible, true);
  assert.match(error.text, /HTTP 500/);
  assert.match(error.text, /\/sap\/opu\/odata4\/sap\/zui_mig_shared_o4\/srvd\/sap\/zui_mig_zrmig_sample_fm_alv\/0001\/ZC_ZRMIG_SAMPLE_FM_ALV/);
  handle.close();
  assert.equal(ui.models[0].destroyed, true);
});

test("missing EntitySet lists the requested service and actual EntitySets without binding data", async () => {
  const ui = reportUi();
  ui.report.open(ui.owner, serviceRootUrl, config({ entitySet: "Missing" }), () => true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(ui.metaPaths, ["/$EntityContainer/"]);
  assert.equal(ui.bindings.length, 0);
  const error = ui.created.find((control) => control instanceof ui.MessageStrip);
  assert.match(error.text, /EntitySet 'Missing'/);
  assert.match(error.text, /Service URL: \/sap\/opu\/odata4\/sap\/demo\/srvd\/sap\/demo\/0001\//);
  assert.match(error.text, /Các EntitySet hiện có: Products, Orders/);
});

test("metadata HTTP failure shows status and metadata URL", async () => {
  const ui = reportUi(metadata(), { status: 403, message: "Forbidden" });
  ui.report.open(ui.owner, serviceRootUrl, config(), () => true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ui.bindings.length, 0);
  const error = ui.created.find((control) => control instanceof ui.MessageStrip);
  assert.match(error.text, /HTTP 403/);
  assert.match(error.text, /\/sap\/opu\/odata4\/sap\/demo\/srvd\/sap\/demo\/0001\/\$metadata/);
});
