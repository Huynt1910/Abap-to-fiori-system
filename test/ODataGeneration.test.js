const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadUtility(extraContext = {}) {
  let exported;
  const filePath = path.resolve(__dirname, "..", "webapp", "util", "ODataGeneration.js");
  const context = Object.assign({
    sap: { ui: { define(deps, factory) { exported = factory(); } } },
    Math
  }, extraContext);
  vm.runInNewContext(fs.readFileSync(filePath, "utf8"), context, { filename: filePath });
  return exported;
}

test("generation parameters are uppercase and signatures change with any input", () => {
  const helper = loadUtility();
  const state = {
    targetPackage: " z_target ", providerPackage: " z_provider ",
    providerLanguage: "standard", transportRequest: " devk900001 "
  };
  const parameters = helper.normalizeParameters(state, helper.ZERO_UUID);

  assert.equal(parameters.TargetPackage, "Z_TARGET");
  assert.equal(parameters.ProviderPackage, "Z_PROVIDER");
  assert.equal(parameters.TransportRequest, "DEVK900001");
  assert.notEqual(helper.signature(state), helper.signature({ ...state, targetPackage: "Z_OTHER" }));
});

test("response parsing keeps outer fields when ResultJson is invalid", () => {
  const helper = loadUtility();
  const parsed = helper.parseResponse({ Status: "FAILED", RuntimeCheck: "REPOSITORY_UNVERIFIED", Message: "Review repository", ResultJson: "{" });

  assert.equal(parsed.status, "FAILED");
  assert.equal(parsed.runtimeCheck, "REPOSITORY_UNVERIFIED");
  assert.equal(parsed.message, "Review repository");
  assert.equal(parsed.resultJsonInvalid, true);
  assert.deepEqual(Object.keys(parsed.result), []);
});

test("UUID fallback creates an RFC 4122 version 4 Edm.Guid", () => {
  const helper = loadUtility({ crypto: {} });
  const uuid = helper.createUuid();
  assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("zero UUID is never a usable active RequestId", () => {
  const helper = loadUtility();
  assert.equal(helper.isZeroUuid(" 00000000-0000-0000-0000-000000000000 "), true);
  assert.equal(helper.isUsableRequestId(helper.ZERO_UUID), false);
  assert.equal(helper.isUsableRequestId(""), false);
  assert.equal(helper.isUsableRequestId("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"), true);
});

test("CLOUD sends no ProviderPackage and ignores its stale value in the signature", () => {
  const helper = loadUtility();
  const state = { targetPackage: " z_target ", providerLanguage: "cloud", providerPackage: "Z_OLD", transportRequest: " devk900001 " };
  const parameters = helper.normalizeParameters(state, helper.ZERO_UUID);

  assert.equal(parameters.ProviderPackage, "");
  assert.equal(parameters.ProviderLanguage, "CLOUD");
  assert.equal(helper.signature(state), helper.signature({ ...state, providerPackage: "Z_ANOTHER" }));
  assert.notEqual(helper.signature(state), helper.signature({ ...state, providerLanguage: "STANDARD" }));
});

test("active generation status is independent from polling state", () => {
  const helper = loadUtility();
  assert.equal(helper.isGenerationActive("QUEUED"), true);
  assert.equal(helper.isGenerationActive("RUNNING"), true);
  ["READY", "GENERATED", "BLOCKED", "FAILED"].forEach((status) => {
    assert.equal(helper.isGenerationActive(status), false);
  });
});
