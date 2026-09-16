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
    Promise
  };

  vm.runInNewContext(source, context, { filename: filePath });
  return exported;
}

class Filter {
  constructor(pathOrConfig, operator, value) {
    Object.assign(this, typeof pathOrConfig === "object" ? pathOrConfig : { path: pathOrConfig, operator, value });
  }
}

class Sorter {
  constructor(pathValue, descending) {
    this.path = pathValue;
    this.descending = descending;
  }
}

function createService() {
  const calls = [];
  const service = new AnalysisService({
    bindContext(pathValue, context, parameters) {
      calls.push({ type: "context", path: pathValue, parameters });
      return {
        requestObject() {
          return Promise.resolve({ path: pathValue });
        }
      };
    },
    bindList(pathValue, context, sorters, filters, parameters) {
      calls.push({ type: "list", path: pathValue, sorters, filters, parameters });
      return {
        requestContexts(start, length) {
          calls[calls.length - 1].start = start;
          calls[calls.length - 1].length = length;
          return Promise.resolve([{ getObject: () => ({ path: pathValue }) }]);
        }
      };
    }
  });

  return { service, calls };
}

const root = path.resolve(__dirname, "..");
const Constants = loadUi5Module(path.join(root, "webapp", "util", "Constants.js"));
const AnalysisService = loadUi5Module(path.join(root, "webapp", "service", "AnalysisService.js"), {
  "sap/ui/model/Filter": Filter,
  "sap/ui/model/FilterOperator": { Contains: "Contains", EQ: "EQ" },
  "sap/ui/model/Sorter": Sorter,
  "abap/to/fiori/system/util/Constants": Constants
});
const FioriUiConfig = loadUi5Module(path.join(root, "webapp", "util", "FioriUiConfig.js"));

const analysisId = "8b95f36a-4f27-1fe1-a4a6-40de08121663";
const outputId = "11111111-2222-3333-4444-555555555555";
const recommendationId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

test("analysis service reads source objects through the analysis navigation", async () => {
  const { service, calls } = createService();

  await service.getSourceObjects(analysisId);

  assert.equal(calls[0].type, "list");
  assert.equal(calls[0].path, `/Analyses(${analysisId})/_SourceObjects`);
  assert.equal(calls[0].sorters[0].path, "ObjectName");
  assert.match(calls[0].parameters.$select, /ObjectName/);
});

test("analysis service reads ALV output parent and children with composite key navigation", async () => {
  const { service, calls } = createService();

  await service.getAlvOutputById(analysisId, outputId);
  await service.getAlvOutputChildren(analysisId, outputId, "alvColumns");
  await service.getAlvOutputChildren(analysisId, outputId, "alvSorts");
  await service.getAlvOutputChildren(analysisId, outputId, "alvFilters");
  await service.getAlvOutputChildren(analysisId, outputId, "alvEvents");

  assert.equal(calls[0].path, `/AlvOutputs(AnalysisId=${analysisId},OutputId=${outputId})`);
  assert.equal(calls[0].parameters.$$groupId, "$direct");
  assert.equal(calls[1].path, `/AlvOutputs(AnalysisId=${analysisId},OutputId=${outputId})/_Columns`);
  assert.equal(calls[1].sorters[0].path, "ColumnPosition");
  assert.equal(calls[2].path, `/AlvOutputs(AnalysisId=${analysisId},OutputId=${outputId})/_Sorts`);
  assert.equal(calls[2].sorters[0].path, "SortPosition");
  assert.equal(calls[3].path, `/AlvOutputs(AnalysisId=${analysisId},OutputId=${outputId})/_Filters`);
  assert.equal(calls[4].path, `/AlvOutputs(AnalysisId=${analysisId},OutputId=${outputId})/_Events`);
  calls.slice(1).forEach((call) => assert.equal(call.length, 1000));
});

test("analysis service reads recommendation parent and annotations with composite key navigation", async () => {
  const { service, calls } = createService();

  await service.getRecommendationById(analysisId, recommendationId);
  await service.getRecommendationAnnotations(analysisId, recommendationId);

  assert.equal(calls[0].path, `/Recommendations(AnalysisId=${analysisId},RecommendationId=${recommendationId})`);
  assert.equal(calls[0].parameters.$$groupId, "$direct");
  assert.equal(calls[1].path, `/Recommendations(AnalysisId=${analysisId},RecommendationId=${recommendationId})/_Annotations`);
  assert.equal(calls[1].sorters[0].path, "AnnotationSequence");
  assert.match(calls[1].parameters.$select, /AnnotationName/);
});

test("analysis service rejects unsupported or incomplete parent-child keys", async () => {
  const { service } = createService();

  await assert.rejects(() => service.getAlvOutputChildren(analysisId, outputId, "unknown"), /Unsupported ALV child table/);
  assert.throws(() => service.getAlvOutputById("", outputId), /AnalysisId and OutputId are required/);
  assert.throws(() => service.getRecommendationById(analysisId, ""), /AnalysisId and RecommendationId are required/);
});

test("prepareFioriUi sends the bound OData V4 action with trimmed parameters and direct group", async () => {
  const calls = [];
  const service = new AnalysisService({
    bindContext(actionPath) {
      calls.push(["bindContext", actionPath]);
      return {
        setParameter(name, value) { calls.push(["setParameter", name, value]); },
        execute(groupId) { calls.push(["execute", groupId]); return Promise.resolve(); },
        getBoundContext() {
          return { requestObject: () => Promise.resolve({ Status: "CONFIG_READY", ConfigJson: "{}" }) };
        }
      };
    }
  });

  const result = await service.prepareFioriUi(analysisId, {
    targetPackage: "  Z_FIORI  ", serviceRootUrl: "  /sap/opu/odata4/report/  "
  });

  assert.deepEqual(calls, [
    ["bindContext", `/Analyses(${analysisId})/${Constants.action.prepareFioriUiSuffix}`],
    ["setParameter", "TargetPackage", "Z_FIORI"],
    ["setParameter", "ServiceRootUrl", "/sap/opu/odata4/report/"],
    ["execute", "$direct"]
  ]);
  assert.equal(result.Status, "CONFIG_READY");
});

test("prepareFioriUi rejects missing inputs before binding the action", async () => {
  let bound = false;
  const service = new AnalysisService({ bindContext() { bound = true; } });
  await assert.rejects(service.prepareFioriUi(analysisId, { targetPackage: " ", serviceRootUrl: "/sap/report/" }), /required/);
  await assert.rejects(service.prepareFioriUi("", { targetPackage: "Z_FIORI", serviceRootUrl: "/sap/report/" }), /required/);
  assert.equal(bound, false);
});

test("FioriUiConfig parses result details and keeps METADATA_REQUIRED as a pending status", () => {
  const result = FioriUiConfig.parse({
    Status: "CONFIG_READY", RuntimeCheck: "METADATA_REQUIRED", IssueCount: 1,
    ConfigJson: JSON.stringify({
      ListReport: {
        EntitySet: "ReportItems",
        Columns: [{ FieldName: "CompanyCode", Label: "Company Code" }],
        Filters: ["CompanyCode"]
      },
      Issues: [{ Message: "Review mapping", Severity: "WARNING" }]
    })
  });
  assert.equal(result.status, "CONFIG_READY");
  assert.equal(result.runtimeCheck, "METADATA_REQUIRED");
  assert.equal(result.issueCount, 1);
  assert.equal(result.entitySet, "ReportItems");
  assert.equal(result.columns[0].label, "CompanyCode");
  assert.equal(result.filters[0].label, "CompanyCode");
  assert.equal(result.issues[0].label, "Review mapping");
});

test("FioriUiConfig rejects invalid or non-object ConfigJson", () => {
  assert.throws(() => FioriUiConfig.parse({ ConfigJson: "{" }), /Invalid ConfigJson/);
  assert.throws(() => FioriUiConfig.parse({ ConfigJson: "null" }), /Invalid ConfigJson/);
});

function createActionService() {
  const calls = [];
  const service = new AnalysisService({
    bindContext(actionPath) {
      calls.push(["bindContext", actionPath]);
      return {
        setParameter(name, value) { calls.push(["setParameter", name, value]); },
        execute() { calls.push(["execute"]); return Promise.resolve(); },
        getBoundContext() {
          return { requestObject: () => Promise.resolve({ Status: "READY" }) };
        }
      };
    }
  });
  return { service, calls };
}

test("preflightOData creates a deferred bound action and sends all named parameters", async () => {
  const { service, calls } = createActionService();
  const parameters = {
    TargetPackage: "Z_TARGET", ProviderPackage: "Z_PROVIDER", ProviderLanguage: "STANDARD",
    TransportRequest: "", RequestId: "00000000-0000-0000-0000-000000000000"
  };

  const result = await service.preflightOData(analysisId, parameters);

  assert.deepEqual(calls, [
    ["bindContext", `/Analyses(${analysisId})/${Constants.action.preflightODataSuffix}`],
    ["setParameter", "TargetPackage", "Z_TARGET"],
    ["setParameter", "ProviderPackage", "Z_PROVIDER"],
    ["setParameter", "ProviderLanguage", "STANDARD"],
    ["setParameter", "TransportRequest", ""],
    ["setParameter", "RequestId", "00000000-0000-0000-0000-000000000000"],
    ["execute"]
  ]);
  assert.equal(result.Status, "READY");
});

test("generateOData sends transport and RequestId through a fresh bound action", async () => {
  const { service, calls } = createActionService();
  const requestId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

  await service.generateOData(analysisId, {
    TargetPackage: "Z_TARGET", ProviderPackage: "Z_PROVIDER", ProviderLanguage: "STANDARD",
    TransportRequest: "DEVK900001", RequestId: requestId
  });

  assert.equal(calls[0][1], `/Analyses(${analysisId})/${Constants.action.generateODataSuffix}`);
  assert.deepEqual(calls.find((call) => call[1] === "TransportRequest"), ["setParameter", "TransportRequest", "DEVK900001"]);
  assert.deepEqual(calls.find((call) => call[1] === "RequestId"), ["setParameter", "RequestId", requestId]);
});

test("getODataGeneration polls with the existing RequestId", async () => {
  const { service, calls } = createActionService();
  const requestId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

  await service.getODataGeneration(analysisId, requestId);

  assert.deepEqual(calls, [
    ["bindContext", `/Analyses(${analysisId})/${Constants.action.getODataGenerationSuffix}`],
    ["setParameter", "RequestId", requestId],
    ["execute"]
  ]);
});
