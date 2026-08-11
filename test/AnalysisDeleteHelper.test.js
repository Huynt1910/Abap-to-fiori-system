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

function context(data) {
  return {
    getProperty(pathValue) {
      return String(pathValue).split("/").reduce((value, part) => value && value[part], data);
    },
    getObject() {
      return data;
    }
  };
}

const root = path.resolve(__dirname, "..");
const AnalysisDeleteHelper = loadUi5Module(path.join(root, "webapp", "util", "AnalysisDeleteHelper.js"), {
  "abap/to/fiori/system/util/ODataErrorHandler": {
    parse(error) {
      return {
        message: error && error.message || "Unexpected error."
      };
    }
  }
});

test("analysis delete helper splits selected contexts by backend deletable flag", () => {
  const deletable = context({ ProgramName: "Z_OK", __EntityControl: { Deletable: true } });
  const blockedFalse = context({ ProgramName: "Z_BLOCKED", __EntityControl: { Deletable: false } });
  const blockedMissing = context({ ProgramName: "Z_MISSING" });

  const result = AnalysisDeleteHelper.splitByDeletePermission([deletable, blockedFalse, blockedMissing]);

  assert.equal(result.deletableContexts.length, 1);
  assert.equal(result.deletableContexts[0], deletable);
  assert.equal(result.blockedContexts.length, 2);
  assert.equal(result.blockedContexts[0], blockedFalse);
  assert.equal(result.blockedContexts[1], blockedMissing);
});

test("analysis delete helper builds user-facing program preview without ids", () => {
  const rows = ["Z1", "Z2", "Z3", "Z4", "Z5", "Z6"].map((name) => context({
    AnalysisId: `${name}-id`,
    ProgramName: name,
    __EntityControl: { Deletable: true }
  }));

  const preview = AnalysisDeleteHelper.buildProgramPreview(rows, 5);

  assert.equal(preview.names.join(","), "Z1,Z2,Z3,Z4,Z5");
  assert.equal(preview.remaining, 1);
});

test("analysis delete helper summarizes partial delete failures by program", () => {
  const rows = [
    context({ ProgramName: "Z_OK", __EntityControl: { Deletable: true } }),
    context({ ProgramName: "Z_FAIL", __EntityControl: { Deletable: true } })
  ];

  const summary = AnalysisDeleteHelper.summarizeDeleteResults([
    { status: "fulfilled" },
    { status: "rejected", reason: new Error("Backend rejected delete") }
  ], rows, 3);

  assert.equal(summary.successCount, 1);
  assert.equal(summary.failedCount, 1);
  assert.equal(summary.blockedCount, 3);
  assert.equal(summary.failures[0].programName, "Z_FAIL");
  assert.equal(summary.failures[0].message, "Backend rejected delete");
});
