const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

class JSONModel {
  constructor(data) { this.data = data; }
  getData() { return this.data; }
  setData(data) { this.data = data; }
  setProperty(key, value) { this.data[key.slice(1)] = value; }
}

let AuthenticationService;
const file = path.resolve(__dirname, "../webapp/service/AuthenticationService.js");
vm.runInNewContext(fs.readFileSync(file, "utf8"), {
  sap: { ui: { define(dependencies, factory) {
    AuthenticationService = factory(JSONModel);
  } } },
  Promise
}, { filename: file });

test("direct ABAP deployment exposes actions without calling the BTP user API", async () => {
  let fetchCount = 0;
  const service = new AuthenticationService({
    location: { hostname: "s40lp1.ucc.cit.tum.de", pathname: "/sap/bc/ui5_ui5/sap/z_abap_fiori/index.html" },
    fetch: () => { fetchCount += 1; throw new Error("BTP user API should not be called"); }
  });
  const state = await service.restoreSession();
  assert.equal(fetchCount, 0);
  assert.equal(state.mode, "abap");
  assert.equal(state.busy, false);
  assert.equal(state.canAnalyze, true);
  assert.equal(state.canCompare, true);
  assert.equal(state.canExport, true);
  assert.equal(state.canMail, true);
  assert.equal(service.handleHttpStatus(401), false);
});

test("ABAP response identifies a direct deployment at a custom URL", async () => {
  let fetchCount = 0;
  const service = new AuthenticationService({
    location: { hostname: "s40lp1.ucc.cit.tum.de", pathname: "/index.html" },
    fetch: async () => {
      fetchCount += 1;
      return {
        ok: false,
        status: 404,
        headers: { get: (name) => name === "sap-server" ? "true" : null }
      };
    }
  });
  const state = await service.restoreSession();
  assert.equal(state.mode, "abap");
  assert.equal(state.busy, false);
  assert.equal(state.canCompare, true);
  assert.equal(state.canAnalyze, true);
  assert.equal(state.canMail, true);
  assert.equal(service.handleHttpStatus(401), false);
  await service.restoreSession();
  assert.equal(fetchCount, 1);
});

test("unrelated BTP 404 does not grant ABAP actions", async () => {
  const service = new AuthenticationService({
    location: { hostname: "app.example.test", pathname: "/index.html" },
    fetch: async () => ({
      ok: false,
      status: 404,
      headers: { get: () => null }
    })
  });
  await assert.rejects(service.restoreSession(), /Unable to retrieve the authenticated user/);
  assert.equal(service.getModel().getData().authenticated, false);
  assert.equal(service.getModel().getData().canCompare, false);
});

test("BTP route still uses user scopes to decide which actions are visible", async () => {
  const requests = [];
  const service = new AuthenticationService({
    location: { hostname: "app.example.test", pathname: "/index.html" },
    fetch: async (url) => {
      requests.push(url);
      return { ok: true, json: async () => ({ name: "viewer", scopes: ["AnalysisRead", "Export"] }) };
    }
  });
  const state = await service.restoreSession();
  assert.deepEqual(requests, ["/user-api/currentUser"]);
  assert.equal(state.mode, "btp");
  assert.equal(state.canRead, true);
  assert.equal(state.canExport, true);
  assert.equal(state.canAnalyze, false);
  assert.equal(state.canCompare, false);
  assert.equal(state.canMail, false);
});

test("Launchpad shell remains the source of the SAP user and actions", async () => {
  const service = new AuthenticationService({
    location: { hostname: "s40lp1.ucc.cit.tum.de", pathname: "/sap/bc/ui5_ui5/sap/z_abap_fiori/index.html" },
    shellContainer: { getUser: () => ({ getId: () => "DEV-110", getFullName: () => "Developer" }), logout() {} },
    fetch: () => { throw new Error("User API should not be called"); }
  });
  const state = await service.restoreSession();
  assert.equal(state.mode, "flp");
  assert.equal(state.sapUser, "DEV-110");
  assert.equal(state.canCompare, true);
});
