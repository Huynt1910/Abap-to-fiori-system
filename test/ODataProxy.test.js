const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const { randomUUID } = require("node:crypto");
const os = require("node:os");
const nodePath = require("node:path");
const test = require("node:test");

test("installed proxy preserves HEAD, authentication and the token/session pair for batch", async (t) => {
  // Isolate the fixture from local SAP credentials and corporate proxy settings.
  const saved = { ...process.env };
  const originalCwd = process.cwd();
  const isolatedCwd = fs.mkdtempSync(nodePath.join(os.tmpdir(), "odata-proxy-test-"));
  t.after(() => {
    process.chdir(originalCwd);
    fs.rmSync(isolatedCwd, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, saved);
  });
  process.chdir(isolatedCwd);
  process.env.DOTENV_CONFIG_QUIET = "true";
  const createProxy = require("ui5-middleware-simpleproxy/lib/proxy");
  process.chdir(originalCwd);
  for (const key of Object.keys(process.env)) {
    if (/^UI5_MIDDLEWARE_|^(https?|all|no)_proxy$/i.test(key)) delete process.env[key];
  }
  process.env.NO_PROXY = "127.0.0.1,localhost";
  const token = randomUUID();
  const cookie = "SAP_SESSIONID_TEST_324=" + randomUUID();
  const authorization = "Basic " + Buffer.from(randomUUID()).toString("base64");
  const requests = [];
  const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const upstream = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-CSRF-Token", token);
      res.setHeader("Set-Cookie", [cookie + "; Path=/sap; HttpOnly", "sap-usercontext=sap-client=324; Path=/"]);
      res.end(req.method === "HEAD" ? undefined : "{}");
    });
  });
  t.after(() => { upstream.closeAllConnections(); upstream.close(); });
  await listen(upstream);
  const middleware = await createProxy({
    log: { info() {} },
    options: { configuration: { baseUri: `http://127.0.0.1:${upstream.address().port}/sap` } }
  });
  const local = http.createServer((req, res) => {
    // UI5 mounts the middleware on /sap, stripping that prefix before invocation.
    req.originalUrl = req.url;
    req.url = req.url.slice(4);
    middleware(req, res, () => { res.statusCode = 404; res.end(); });
  });
  t.after(() => { local.closeAllConnections(); local.close(); });
  await listen(local);
  const path = "/sap/opu/odata4/sap/test/srvd/sap/test/0001/";
  const base = `http://127.0.0.1:${local.address().port}`;
  const head = await fetch(base + path + "?sap-client=324", {
    method: "HEAD", headers: { authorization, "X-CSRF-Token": "Fetch" },
    signal: AbortSignal.timeout(5000)
  });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("x-csrf-token"), token);
  assert.equal(head.headers.getSetCookie().length, 2);
  assert.ok(head.headers.getSetCookie()[0].startsWith(cookie + ";"));
  const batchBody = "--fixture\r\nContent-Type: application/http\r\n\r\nGET Analyses?$top=1 HTTP/1.1\r\n\r\n--fixture--\r\n";
  const batch = await fetch(base + path + "$batch?sap-client=324", {
    method: "POST", headers: {
      authorization, cookie, "X-CSRF-Token": head.headers.get("x-csrf-token"),
      "Content-Type": "multipart/mixed; boundary=fixture"
    }, body: batchBody, signal: AbortSignal.timeout(5000)
  });
  assert.equal(batch.status, 200);
  await batch.text();
  assert.equal(requests.length, 2);
  assert.equal(requests[0].method, "HEAD");
  assert.equal(requests[0].url, path + "?sap-client=324");
  assert.equal(requests[0].headers["x-csrf-token"], "Fetch");
  assert.equal(requests[0].headers.authorization, authorization);
  assert.equal(requests[1].url, path + "$batch?sap-client=324");
  assert.equal(requests[1].headers.authorization, authorization);
  assert.equal(requests[1].headers.cookie, cookie);
  assert.equal(requests[1].headers["x-csrf-token"], token);
  assert.equal(requests[1].body, batchBody);
});
