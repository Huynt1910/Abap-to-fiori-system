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
    Date,
    setTimeout
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

const root = path.resolve(__dirname, "..");
const ComparisonConstants = loadUi5Module(path.join(root, "webapp", "model", "ComparisonConstants.js"));
const ComparisonFormatter = loadUi5Module(path.join(root, "webapp", "model", "ComparisonFormatter.js"));
const ComparisonService = loadUi5Module(path.join(root, "webapp", "service", "ComparisonService.js"), {
  "sap/ui/model/Filter": Filter,
  "sap/ui/model/FilterOperator": { EQ: "EQ" },
  "sap/ui/model/Sorter": Sorter,
  "abap/to/fiori/system/model/ComparisonConstants": ComparisonConstants
});

const analysisId = "11111111-2222-3333-4444-555555555555";
const runId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

test("comparison service validates GUID input and rejects missing action AnalysisId", async () => {
  let bindContextCalls = 0;
  const service = new ComparisonService({
    bindContext() {
      bindContextCalls += 1;
    }
  });

  assert.equal(service.isGuid(analysisId), true);
  assert.equal(service.isGuid(""), false);
  assert.equal(service.isGuid("not-a-guid"), false);
  await assert.rejects(() => service.executeComparison(""), /Valid AnalysisId is required/);
  assert.equal(bindContextCalls, 0);
});

test("executeComparison uses collection-bound action path, AnalysisId parameter and direct group", async () => {
  const calls = [];
  const service = new ComparisonService({
    bindContext(actionPath) {
      calls.push(["bindContext", actionPath]);
      return {
        setParameter(name, value) {
          calls.push(["setParameter", name, value]);
        },
        execute(groupId) {
          calls.push(["execute", groupId]);
          return Promise.resolve();
        },
        getBoundContext() {
          return {
            requestObject: async () => ({ CmpRunId: runId })
          };
        }
      };
    }
  });

  const result = await service.executeComparison(analysisId);

  assert.deepEqual(calls, [
    ["bindContext", ComparisonConstants.action.executeComparison],
    ["setParameter", "AnalysisId", analysisId],
    ["execute", "$direct"]
  ]);
  assert.equal(result.CmpRunId, runId);
});

test("executeComparison accepts 204 style action responses without a bound context", async () => {
  const service = new ComparisonService({
    bindContext() {
      return {
        setParameter() {},
        execute() {
          return Promise.resolve();
        },
        getBoundContext() {
          return null;
        }
      };
    }
  });

  assert.equal(JSON.stringify(await service.executeComparison(analysisId)), "{}");
});

test("getComparisonRuns reads with supported filters and CreatedAt descending sort", async () => {
  let bindingRequest;
  const service = new ComparisonService({
    bindList(pathValue, context, sorters, filters, parameters) {
      bindingRequest = { pathValue, sorters, filters, parameters };
      return {
        requestContexts(start, length) {
          assert.equal(start, 0);
          assert.equal(length, 5);
          return Promise.resolve([{ getObject: () => ({ CmpRunId: runId }) }]);
        }
      };
    }
  });

  const rows = await service.getComparisonRuns({
    top: 5,
    filters: {
      analysisId,
      programName: "ZREP",
      targetStrategy: "FIORI",
      overallStatus: "WARNING",
      runStatus: "COMPLETED"
    }
  });

  assert.equal(bindingRequest.pathValue, "/ComparisonRuns");
  assert.equal(bindingRequest.sorters[0].path, "CreatedAt");
  assert.equal(bindingRequest.sorters[0].descending, true);
  assert.equal(
    bindingRequest.filters.map((filter) => filter.path).join(","),
    "AnalysisId,ProgramName,TargetStrategy,OverallStatus,RunStatus"
  );
  assert.match(bindingRequest.parameters.$select, /CmpRunId/);
  assert.equal(rows[0].CmpRunId, runId);
});

test("discoverNewRun ignores old runs and selects the new run for the same analysis", async () => {
  const previousRunId = "bbbbbbbb-1111-2222-3333-444444444444";
  const newRunId = "cccccccc-1111-2222-3333-444444444444";
  const service = new ComparisonService({}, {
    sleep: async () => undefined,
    discoveryTimeoutMs: 1000,
    discoveryIntervalMs: 0
  });
  let calls = 0;

  service.getComparisonRuns = async () => {
    calls += 1;
    return [
      { CmpRunId: previousRunId, AnalysisId: analysisId, CreatedAt: "2026-08-08T01:00:00Z" },
      { CmpRunId: newRunId, AnalysisId: analysisId, CreatedAt: "2026-08-08T01:00:02Z" },
      { CmpRunId: "dddddddd-1111-2222-3333-444444444444", AnalysisId: "99999999-2222-3333-4444-555555555555", CreatedAt: "2026-08-08T01:00:03Z" }
    ];
  };

  const run = await service.discoverNewRun(analysisId, [previousRunId], new Date("2026-08-08T01:00:01Z").getTime());

  assert.equal(run.CmpRunId, newRunId);
  assert.equal(calls, 1);
});

test("discoverNewRun times out when the action response has no discoverable run", async () => {
  const service = new ComparisonService({}, {
    sleep: async () => undefined,
    discoveryTimeoutMs: -1,
    discoveryIntervalMs: 0
  });

  service.getComparisonRuns = async () => [];

  await assert.rejects(() => service.discoverNewRun(analysisId, [], Date.now()), /Could not identify/);
});

test("pollRunStatus returns the terminal run and maps failed statuses", async () => {
  const statuses = ["RUNNING", "PROCESSING", "SUCCESS"];
  const service = new ComparisonService({}, {
    sleep: async () => undefined,
    statusTimeoutMs: 1000,
    statusIntervalMs: 0
  });

  service.getComparisonRunById = async () => ({ CmpRunId: runId, RunStatus: statuses.shift() });

  const run = await service.pollRunStatus(runId);

  assert.equal(run.RunStatus, "SUCCESS");
  assert.equal(service.isTerminalRun({ RunStatus: "COMPLETED" }), true);
  assert.equal(service.isTerminalRun({ RunStatus: "FAILED" }), true);
  assert.equal(service.isFailedStatus("ERROR"), true);
});

test("polling can be cancelled while waiting", async () => {
  const service = new ComparisonService({}, {
    sleep: async () => {
      service.cancelPolling();
    },
    statusTimeoutMs: 1000,
    statusIntervalMs: 0
  });

  service.getComparisonRunById = async () => ({ CmpRunId: runId, RunStatus: "RUNNING" });

  await assert.rejects(() => service.pollRunStatus(runId), /cancelled/);
});

test("comparison formatter maps known and unknown statuses", () => {
  assert.equal(ComparisonFormatter.statusToValueState("COMPLETED"), "Success");
  assert.equal(ComparisonFormatter.statusToValueState("SUCCESS"), "Success");
  assert.equal(ComparisonFormatter.statusToValueState("HIGH_COMPATIBILITY"), "Success");
  assert.equal(ComparisonFormatter.statusToValueState("MANUAL"), "Warning");
  assert.equal(ComparisonFormatter.statusToValueState("UNSUPPORTED"), "Error");
  assert.equal(ComparisonFormatter.statusToValueState("RUNNING"), "Information");
  assert.equal(ComparisonFormatter.statusToValueState("SOMETHING_NEW"), "None");
  assert.equal(ComparisonFormatter.formatCompatibilityRate(70), "70.00");
  assert.equal(ComparisonFormatter.formatCompatibilityRate("bad"), "-");
});
