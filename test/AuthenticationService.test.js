const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

class JSONModel {
  constructor(data) { this.data = data; }
  getData() { return this.data; }
  setData(data) { this.data = data; }
  setProperty(property, value) { this.data[property.slice(1)] = value; }
}

function loadService() {
  let exported;
  const file = path.resolve(__dirname, "..", "webapp", "service", "AuthenticationService.js");
  vm.runInNewContext(fs.readFileSync(file, "utf8"), {
    sap: { ui: { define(dependencies, factory) { exported = factory(JSONModel); } } },
    Promise
  }, { filename: file });
  return exported;
}

const AuthenticationService = loadService();

function response(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body)
  };
}

test("restores the AppRouter user session and maps application scopes", async () => {
  const requests = [];
  const service = new AuthenticationService({
    location: { hostname: "app.cfapps.example", assign() {} },
    fetch(url, options) {
      requests.push({ url, options });
      return Promise.resolve(response(200, {
        name: "user@example.test",
        displayName: "Test User",
        scopes: [
          "abap-to-fiori-system.AnalysisRead",
          "abap-to-fiori-system.AnalysisExecute",
          "abap-to-fiori-system.Export"
        ]
      }));
    }
  });

  const state = await service.restoreSession();

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/user-api/currentUser");
  assert.equal(requests[0].options.credentials, "same-origin");
  assert.equal(requests[0].options.cache, "no-store");
  assert.equal(state.authenticated, true);
  assert.equal(state.canRead, true);
  assert.equal(state.canAnalyze, true);
  assert.equal(state.canExport, true);
  assert.equal(state.canMail, false);
  assert.equal(state.sapUserVerified, false);
  assert.equal(state.sapUser, "");
});

test("a 401 redirects once and does not start a retry loop", async () => {
  const redirects = [];
  let fetchCount = 0;
  const service = new AuthenticationService({
    location: { hostname: "app.cfapps.example", assign(url) { redirects.push(url); } },
    fetch() {
      fetchCount += 1;
      return Promise.resolve(response(401));
    }
  });

  await assert.rejects(service.restoreSession(), /expired/);
  service.handleHttpStatus(401);
  service.handleHttpStatus(401);

  assert.equal(fetchCount, 1);
  assert.deepEqual(redirects, ["/"]);
  assert.equal(service.getModel().getData().authenticated, false);
});

test("local development never asks the browser for SAP credentials", async () => {
  let fetchCount = 0;
  const service = new AuthenticationService({
    location: { hostname: "localhost", assign() {} },
    fetch() { fetchCount += 1; return Promise.reject(new Error("must not run")); }
  });

  const state = await service.restoreSession();

  assert.equal(fetchCount, 0);
  assert.equal(state.mode, "local");
  assert.equal(state.sapUserVerified, false);
  assert.match(state.auditNotice, /server-side proxy/);
  await assert.rejects(service.logout(), /local server/);
});

test("logout uses the AppRouter logout endpoint", async () => {
  const redirects = [];
  const service = new AuthenticationService({
    location: { hostname: "app.cfapps.example", assign(url) { redirects.push(url); } },
    fetch() { return Promise.resolve(response(200, { scopes: [] })); }
  });

  await service.logout();
  assert.deepEqual(redirects, ["/do/logout"]);
});

test("uses the authenticated SAP Fiori Launchpad user without calling BTP User API", async () => {
  let fetchCount = 0;
  let logoutCount = 0;
  const service = new AuthenticationService({
    location: { hostname: "s40.example.test", assign() {} },
    fetch() { fetchCount += 1; return Promise.reject(new Error("must not run")); },
    shellContainer: {
      getUser() {
        return {
          getId: () => "DEV-030",
          getFullName: () => "Development User 030"
        };
      },
      logout() { logoutCount += 1; }
    }
  });

  const state = await service.restoreSession();
  await service.logout();

  assert.equal(fetchCount, 0);
  assert.equal(state.mode, "flp");
  assert.equal(state.authenticated, true);
  assert.equal(state.sapUser, "DEV-030");
  assert.equal(state.sapUserVerified, false);
  assert.match(state.auditNotice, /CurrentUser endpoint/);
  assert.equal(logoutCount, 1);
  assert.equal(service.handleHttpStatus(401), false);
});
