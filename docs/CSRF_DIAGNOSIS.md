# OData V4 CSRF investigation

This file records the original localhost investigation. The current production-authentication status and remaining blockers are maintained in `authentication-feature-audit.md` and `btp-authentication-setup.md`. Since that capture, local TLS verification has been restored to `strictSSL: true` and a real, Git-ignored `.env` may supply local proxy credentials; its values were not inspected.

## Outcome

No runtime patch is justified by the current evidence. SAP itself rejects token
fetches even when the localhost proxy is bypassed. The SAP configuration causing
this rejection is not present in this repository. This is not a verified fix.

After the reported role update, a live `GET Analyses?$top=1&sap-client=324`
through localhost returned 200. The earlier service-group authorization failure
is therefore no longer reproduced by that request.

## Configuration inspected

- `webapp/manifest.json`: all three models are OData V4. The service roots end
  in `/0001/`, with `sap-client=324` as a query parameter. Analysis uses `$auto`
  for reads and updates; mail/comparison use `$direct`. `earlyRequests: true`
  enables early requests; no custom token or authentication headers are configured.
- `ui5.yaml`: `/sap` is mounted on `ui5-middleware-simpleproxy`, targeting the
  configured HTTPS SAP URL ending in `/sap`. The mount prefix is stripped and
  the target prefix is prepended once. No header or query overrides are configured.
- `package.json`: `ui5-middleware-simpleproxy` 3.7.1; installed transitive
  `http-proxy-middleware` is 3.0.7, using the v3 `on.proxyRes` API.
- `node_modules/ui5-middleware-simpleproxy/lib/proxy.js`: forwards all methods;
  no HEAD special case, no server-side cookie jar, and no response cache. Incoming
  headers are forwarded by http-proxy. Optional Basic auth comes from middleware
  username/password options or environment variables. Debug is disabled.
  HTTPS response cookies retain their values but Secure/Domain/Path/SameSite
  attributes are removed for local development. HttpOnly is retained.
- `node_modules/http-proxy-middleware/dist/handlers/response-interceptor.js`:
  copies upstream status and headers, including CSRF and Set-Cookie; buffers and
  decompresses the body, without caching it.
- There is no project-owned Express server or Axios/fetch OData proxy. UI5 CLI
  loads the installed middleware. `DocumentService.js` fetches downloads, not tokens.
- `approuter/xs-app.json` references BTP destination `S40`; this is not used by
  `npm start`. The deployed S40 destination configuration is not in the repository.
  No approuter or CSRF protection settings were changed.
- At the time of the original diagnostic probe, no UI5 middleware environment
  keys were loaded in that shell. Current `.env` values remain intentionally uninspected.

## Live results

No credentials, token values, cookie values or entity contents were logged.
Direct SAP probes used the configured target, without browser credentials.
The original direct probe matched the then-current local TLS setting. Current
configuration defaults to `strictSSL: true`.

| Request | Result |
| --- | --- |
| Local service root GET | 200; only `sap-usercontext`; Cache-Control max-age=0 |
| Local HEAD with X-CSRF-Token: Fetch | 403; X-CSRF-Token: Required; only sap-usercontext |
| Direct SAP HEAD with X-CSRF-Token: Fetch | Same 403 and cookie names |
| Direct SAP GET with X-CSRF-Token: Fetch | 403; /IWBEP/CM_V4H_RUN/075; only sap-usercontext |
| Local entity GET with root response cookie replayed | 200 |
| Local token GET with root response cookie replayed | 403; /IWBEP/CM_V4H_RUN/075 |
| Local POST $batch containing only GET Analyses?$top=1 | 403; /IWBEP/CM_V4H_RUN/043 |

The read-only batch probe used the available cookie but no token, because SAP
did not issue one. A real successful token/session/batch sequence could not be
verified. No SAP_SESSIONID cookie was issued in these probes; its absence alone
does not identify the SAP setting responsible for the token-fetch failure.

## Added verification

`test/ODataProxy.test.js` runs the installed middleware against a local HTTP
fixture. It verifies HEAD and Fetch arrive upstream, Authorization survives both
requests, response token and both cookies survive, and a subsequent batch forwards
the same cookie/token pair and unchanged body/path/client query. Synthetic values
are generated at runtime. This does not test real SAP authentication, HTTPS cookie
attribute rewriting, or Chrome cookie acceptance.

Run: `node --test test/ODataProxy.test.js`.

## Missing evidence required for a backend fix

1. The current failed token-fetch entry in `/IWFND/ERROR_LOG`: user, timestamp,
   request method/path, error context and call stack for `/IWBEP/CM_V4H_RUN/075`.
   The old authorization error is not sufficient.
2. Effective SICF Logon Data and logon procedure for `/sap/opu/odata4`, including
   inherited configuration and whether the configured service user is used.
3. SAP HTTP security-session configuration for client 324 and the corresponding
   backend diagnostic trace at the failing request's timestamp, with secrets removed.
4. If a new custom login API exists: its implementation/config location and
   request/response contract. None was found in the project.

## Restart and Chrome verification after the backend correction

Restart local UI5 with Ctrl+C followed by `npm start`; no new start flags are needed
for the diagnostic additions. In Chrome Network enable Preserve log and Disable
cache, then reload. Check the HEAD request with X-CSRF-Token: Fetch returns 2xx
and a real token (not Required), inspect response cookies and browser rejection
reasons, then confirm the subsequent batch carries that token and the matching
session cookies. Inspect individual responses inside a successful batch as well
as its outer HTTP status. Do not export unredacted HAR files or token/cookie values.
