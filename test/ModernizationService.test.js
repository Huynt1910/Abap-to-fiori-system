const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadUi5Module(filePath, dependencies = {}) {
  let exported;
  vm.runInNewContext(fs.readFileSync(filePath, "utf8"), {
    sap: { ui: { define(names, factory) { exported = factory(...names.map((name) => dependencies[name])); } } },
    Promise
  }, { filename: filePath });
  return exported;
}

class Filter {
  constructor(property, operator, value) { Object.assign(this, { property, operator, value }); }
}
class Sorter {
  constructor(property, descending) { Object.assign(this, { property, descending }); }
}

const root = path.resolve(__dirname, "..");
const Constants = loadUi5Module(path.join(root, "webapp", "util", "Constants.js"));
const ModernizationService = loadUi5Module(path.join(root, "webapp", "service", "ModernizationService.js"), {
  "sap/ui/model/Filter": Filter,
  "sap/ui/model/FilterOperator": { EQ: "EQ" },
  "sap/ui/model/Sorter": Sorter,
  "abap/to/fiori/system/util/Constants": Constants
});
const analysisId = "11111111-2222-3333-4444-555555555555";
const sessionId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

test("metadata-backed analysis actions use qualified V4 paths and direct execution", async () => {
  const calls = [];
  const model = {
    bindContext(pathValue) {
      const call = { path: pathValue, parameters: {}, destroyed: false };
      calls.push(call);
      return {
        setParameter(name, value) { call.parameters[name] = value; },
        execute(group) { call.group = group; return Promise.resolve(); },
        getBoundContext() { return { requestObject: () => Promise.resolve({ Result: "OK" }) }; },
        destroy() { call.destroyed = true; }
      };
    }
  };
  const service = new ModernizationService(model);

  await service.assess(analysisId);
  await service.prepareUi(analysisId, "ZPACKAGE", "/sap/example/");
  await service.ask(sessionId, "What should change?");

  assert.match(calls[0].path, /Analyses\(.+\)\/com\.sap\.gateway\.srvd\.zui_mig_analysis\.v0001\.GenerateAIAssessment\(\.\.\.\)$/);
  assert.deepEqual(calls[1].parameters, { TargetPackage: "ZPACKAGE", ServiceRootUrl: "/sap/example/" });
  assert.deepEqual(calls[2].parameters, { Question: "What should change?" });
  assert.ok(calls.every((call) => call.group === "$direct" && call.destroyed));
});

test("chat create sends business fields only and waits for persistence", async () => {
  let payload;
  let destroyed = false;
  const createdObject = { SessionId: sessionId, AnalysisId: analysisId, SessionName: "Review" };
  const context = {
    created: () => Promise.resolve(),
    requestObject: () => Promise.resolve(createdObject)
  };
  const service = new ModernizationService({
    bindList(pathValue, parent, sorters, filters, parameters) {
      assert.equal(pathValue, "/ChatSessions");
      assert.equal(parameters.$$updateGroupId, "$direct");
      return {
        create(value) { payload = value; return context; },
        destroy() { destroyed = true; }
      };
    }
  });

  const result = await service.createChat(analysisId, " Review ");

  assert.equal(payload.AnalysisId, analysisId);
  assert.equal(payload.SessionName, "Review");
  assert.equal(Object.hasOwn(payload, "CreatedBy"), false);
  assert.equal(result.SessionId, sessionId);
  assert.equal(destroyed, true);
});

test("chat update and delete honor backend entity controls", async () => {
  const operations = [];
  const service = new ModernizationService({
    bindContext() {
      const context = {
        setProperty(name, value, group) { operations.push({ type: "update", name, value, group }); return Promise.resolve(); },
        delete(group) { operations.push({ type: "delete", group }); return Promise.resolve(); }
      };
      return {
        requestObject: () => Promise.resolve({ __EntityControl: { Updatable: true, Deletable: true } }),
        getBoundContext: () => context,
        destroy() {}
      };
    }
  });

  await service.changeChat(sessionId, " Renamed ", false);
  await service.changeChat(sessionId, "", true);

  assert.deepEqual(operations, [
    { type: "update", name: "SessionName", value: "Renamed", group: "$direct" },
    { type: "delete", group: "$direct" }
  ]);
});
