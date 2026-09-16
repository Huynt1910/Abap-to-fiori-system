const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function loadUi5Module(filePath, dependencies = {}, contextAdditions = {}) {
  let exported;
  const context = Object.assign({
    sap: { ui: { define(deps, factory) { exported = factory(...deps.map((dep) => dependencies[dep])); } } },
    Promise,
    setTimeout,
    clearTimeout
  }, contextAdditions);
  vm.runInNewContext(fs.readFileSync(filePath, "utf8"), context, { filename: filePath });
  return exported;
}

const ODataGeneration = loadUi5Module(path.join(root, "webapp", "util", "ODataGeneration.js"));
const toastMessages = [];
const ControllerDefinition = loadUi5Module(path.join(root, "webapp", "controller", "AnalysisDetail.controller.js"), {
  "sap/ui/core/Fragment": {},
  "sap/m/MessageBox": {},
  "sap/m/MessageToast": { show(message) { toastMessages.push(message); } },
  "sap/ui/model/Filter": function () {},
  "sap/ui/model/FilterOperator": {},
  "sap/ui/model/Sorter": function () {},
  "abap/to/fiori/system/controller/BaseController": { extend(name, definition) { return definition; } },
  "abap/to/fiori/system/model/models": {},
  "abap/to/fiori/system/model/mailConstants": {},
  "abap/to/fiori/system/model/mailFormatter": {},
  "abap/to/fiori/system/model/ComparisonConstants": {},
  "abap/to/fiori/system/model/AnalysisTableConfig": {},
  "abap/to/fiori/system/util/TablePersonalizationService": function () {},
  "abap/to/fiori/system/util/Constants": {},
  "abap/to/fiori/system/util/FioriUiConfig": {},
  "abap/to/fiori/system/util/ODataGeneration": ODataGeneration,
  "abap/to/fiori/system/util/formatter": {}
});

class Model {
  constructor(data) { this.data = data; }
  getProperty(propertyPath) {
    return propertyPath.split("/").filter(Boolean).reduce((value, key) => value && value[key], this.data);
  }
  setProperty(propertyPath, value) {
    const keys = propertyPath.split("/").filter(Boolean);
    const last = keys.pop();
    const parent = keys.reduce((current, key) => current[key] || (current[key] = {}), this.data);
    parent[last] = value;
  }
}

function createController(generationOverrides = {}) {
  const generation = Object.assign({
    dialogBusy: false, polling: false, targetPackage: "Z_TARGET", providerPackage: "Z_PROVIDER",
    providerLanguage: "STANDARD", transportRequest: "DEVK900001", requestId: "",
    status: "", runtimeCheck: "", message: "", result: {}, resultJsonInvalid: false,
    preflightReady: false, preflightSignature: "", generationSignature: "", canGenerate: false,
    error: "", hasResult: false
  }, generationOverrides);
  const controller = Object.assign({}, ControllerDefinition, {
    _oViewModel: new Model({ analysisId: "8b95f36a-4f27-1fe1-a4a6-40de08121663", odataGeneration: generation }),
    getText(key) { return key; },
    parseError(error) { return { message: error.message || "Unexpected error." }; }
  });
  return controller;
}

test("STANDARD requires ProviderPackage and generation requires TransportRequest", () => {
  const controller = createController();
  assert.equal(controller._validateODataGeneration({ targetPackage: "Z", providerLanguage: "STANDARD", providerPackage: "" }, false), "odataGenerationProviderPackageRequired");
  assert.equal(controller._validateODataGeneration({ targetPackage: "Z", providerLanguage: "CLOUD", providerPackage: "" }, false), "");
  assert.equal(controller._validateODataGeneration({ targetPackage: "Z", providerLanguage: "CLOUD", transportRequest: "" }, true), "odataGenerationTransportRequired");
});

test("READY can enable generation and an input change invalidates the preflight and RequestId", () => {
  const controller = createController({ preflightReady: true, canGenerate: true, preflightSignature: "old", requestId: "request" });
  const parsed = controller._applyODataGenerationResponse({ Status: "READY", ResultJson: "{}" });
  controller._oViewModel.setProperty("/odataGeneration/preflightReady", parsed.status === "READY");
  controller._oViewModel.setProperty("/odataGeneration/canGenerate", parsed.status === "READY");
  assert.equal(controller._oViewModel.getProperty("/odataGeneration/canGenerate"), true);

  controller._invalidateODataGenerationPreflight();
  assert.equal(controller._oViewModel.getProperty("/odataGeneration/preflightReady"), false);
  assert.equal(controller._oViewModel.getProperty("/odataGeneration/canGenerate"), false);
  assert.equal(controller._oViewModel.getProperty("/odataGeneration/requestId"), "");
});

test("QUEUED starts polling while GENERATED, BLOCKED and FAILED stop it", () => {
  const controller = createController();
  let scheduled = 0;
  controller._scheduleODataGenerationPoll = () => { scheduled += 1; };

  controller._handleODataGenerationStatus({ status: "QUEUED", message: "" }, true);
  assert.equal(controller._oViewModel.getProperty("/odataGeneration/polling"), true);
  assert.equal(scheduled, 1);

  ["GENERATED", "BLOCKED", "FAILED"].forEach((status) => {
    controller._oViewModel.setProperty("/odataGeneration/polling", true);
    controller._handleODataGenerationStatus({ status, message: status }, false);
    assert.equal(controller._oViewModel.getProperty("/odataGeneration/polling"), false);
  });
});

test("poll timeout preserves QUEUED and RequestId and shows the worker hint", async () => {
  const requestId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const controller = createController({ requestId, polling: true });
  controller._iODataGenerationPollCount = 11;
  controller.getAnalysisService = () => ({
    getODataGeneration() { return Promise.resolve({ RequestId: requestId, Status: "QUEUED", ResultJson: "{}" }); }
  });

  controller._pollODataGeneration(false);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(controller._oViewModel.getProperty("/odataGeneration/status"), "QUEUED");
  assert.equal(controller._oViewModel.getProperty("/odataGeneration/requestId"), requestId);
  assert.equal(controller._oViewModel.getProperty("/odataGeneration/polling"), false);
  assert.equal(controller._oViewModel.getProperty("/odataGeneration/message"), "odataGenerationWorkerHint");
});

test("manual refresh polls once with the existing RequestId", async () => {
  const requestId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const controller = createController({ requestId });
  const calls = [];
  controller.getAnalysisService = () => ({
    getODataGeneration(analysisId, currentRequestId) {
      calls.push([analysisId, currentRequestId]);
      return Promise.resolve({ RequestId: currentRequestId, Status: "RUNNING", ResultJson: "{}" });
    }
  });

  controller.onRefreshODataGeneration();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], requestId);
  assert.equal(controller._iODataGenerationTimer, undefined);
});

test("invalid ResultJson does not crash and route/exit cancellation clears polling", () => {
  const controller = createController({ polling: true });
  assert.doesNotThrow(() => controller._applyODataGenerationResponse({ Status: "FAILED", RuntimeCheck: "REPOSITORY_UNVERIFIED", ResultJson: "{" }));
  assert.equal(controller._oViewModel.getProperty("/odataGeneration/resultJsonInvalid"), true);
  controller._iODataGenerationTimer = setTimeout(() => {}, 10000);
  controller._cancelODataGenerationPolling();
  assert.equal(controller._iODataGenerationTimer, null);
  assert.equal(controller._oViewModel.getProperty("/odataGeneration/polling"), false);
});
