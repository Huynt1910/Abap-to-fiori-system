# BTP authentication and SAP principal propagation

## Target flow

```text
Browser
  -> SAP AppRouter (authenticated application session)
  -> XSUAA / configured corporate IdP
  -> Destination service: S40
  -> Connectivity service
  -> SAP Cloud Connector
  -> SAP ABAP OData V4, executing as the mapped SAP user
```

The browser never receives a Destination password and never sends an SAP password. XSUAA authenticates the BTP identity. Principal Propagation and the ABAP logon stack establish the SAP execution identity. SAPUI5 OData V4 and the ABAP OData service manage CSRF inside that authenticated SAP session.

## Repository configuration

- `mta.yaml` binds XSUAA, Destination, HTML5 runtime and Connectivity to the standalone AppRouter.
- `approuter/xs-app.json` and the packaged `xs-app.json` require XSUAA plus `AnalysisRead` for the application, `/user-api/currentUser`, and `/sap/*`.
- `/user-api/currentUser` uses the built-in `sap-approuter-userapi` service to display the authenticated BTP identity and scopes.
- `/sap/*` targets Destination `S40`.
- `csrfProtection: false` applies only to AppRouter's own CSRF layer on the passthrough route. It does not disable SAP Gateway/RAP CSRF. SAPUI5 must still fetch and send the SAP-issued CSRF token with the matching SAP session.
- `xs-security.json` declares Viewer, Analyst, MailOperator and Administrator roles. The hard-coded trial redirect URI has been removed.

## External BTP configuration required

Create or update Destination `S40` in the same subaccount as the AppRouter. Use values appropriate for the landscape; do not store them in this repository.

| Property | Required value |
| --- | --- |
| `Name` | `S40` |
| `Type` | `HTTP` |
| `ProxyType` | `OnPremise` |
| `Authentication` | `PrincipalPropagation` |
| `URL` | Cloud Connector virtual host and port for the SAP system |
| `sap-client` | `324` |

If required by the SAP HTTP session setup, add `URL.headers.x-sap-security-session=true` after validation with the SAP Basis team. Do not add `User` or `Password` to this production Destination.

In SAP Cloud Connector:

1. Connect the BTP subaccount and expose only the required SAP virtual host/port.
2. Permit the required paths, preferably the specific OData V4 service roots under `/sap/opu/odata4/sap/` rather than a broad system path.
3. Configure principal propagation trust/certificates and the identity mapping rule agreed with the IdP and SAP Basis teams.
4. Verify that the subject for each BTP user maps to its real SAP user, including `DEV-030` and `DEV-130`.

In XSUAA/IAS and BTP cockpit:

1. Configure the trusted corporate identity provider.
2. Deploy/update the XSUAA instance from `xs-security.json`.
3. Assign `ABAP_FIORI_VIEWER`, `ABAP_FIORI_ANALYST`, `ABAP_FIORI_MAIL_OPERATOR`, or `ABAP_FIORI_ADMIN` role collections according to least privilege.
4. Do not infer SAP business authorization from UI button visibility. Assign and test the corresponding SAP roles separately.

In SAP ABAP/SICF:

1. Inspect the effective inherited Logon Data for `/sap/opu/odata4` and the service nodes.
2. Remove a fixed service user from production requests that require per-user audit. This is a shared-system administrative change and must be reviewed by SAP Basis before execution.
3. Ensure the logon procedure accepts the principal propagated through Cloud Connector.
4. Keep SAP OData CSRF protection enabled.
5. Test `/IWFND/ERROR_LOG`, security audit log and application log with sanitized evidence only.

SAP documents the relevant AppRouter and principal propagation behavior here:

- [Application Routes and Destinations](https://help.sap.com/docs/btp/sap-business-technology-platform/application-routes-and-destinations)
- [Routing via Destination](https://help.sap.com/docs/btp/sap-business-technology-platform/routing-via-destination)
- [User API Service](https://help.sap.com/docs/btp/sap-business-technology-platform/user-api-service)
- [Propagate User Information Between Applications or Services](https://help.sap.com/docs/authorization-and-trust-management-service/authorization-and-trust-management/propagate-user-information-between-applications-or-services)

## Missing SAP current-user contract

The analysis metadata has no current-user operation, and this repository has no backend source. The implementation is therefore **Blocked: backend repository unavailable**.

The SAP developer should add a read-only contract to the analysis service, for example `UserInfo` or `CurrentUser`, returning:

```json
{
  "sapUser": "DEV-030",
  "displayName": "...",
  "client": "324",
  "scopes": []
}
```

Required backend rules:

- Obtain `sapUser` from the authenticated ABAP execution context (`sy-uname` or the released equivalent) and `client` from `sy-mandt`.
- Never accept these values from a request body, query option, arbitrary header, or browser identity claim.
- Expose the entity as read-only in the service definition, for example through a dedicated CDS entity such as `ZCE_MIG_CURRENT_USER` in service definition `ZUI_MIG_ANALYSIS`, with implementation in the corresponding RAP query provider/behavior pool.
- Apply the same SAP authorization checks as the protected application service.

Once this contract exists, extend `AuthenticationService` to read it after `/user-api/currentUser`, display the returned `sapUser`, and reject a client mismatch. Do not use the response to populate mutation payload audit fields.

## RAP audit requirements

Backend source must be reviewed for `Analyze`, mail creation, chat/session creation, export generation and every update/delete action. Prefer RAP managed audit semantics for creation and local-last-change fields. For custom actions or unmanaged persistence, assign audit values from the authenticated SAP context in the behavior implementation. Ignore or reject incoming `CreatedBy`, `CreatedAt`, `LastChangedBy`, and related fields.

`Analyses.CreatedBy`, `CreatedAt`, `LastChangedBy`, and `LocalLastChangedAt` are not marked `Core.Computed` in the supplied metadata. That does not prove they are unsafe, but it means the service contract currently does not prevent clients from attempting to send them. The behavior implementation and a negative integration test must prove enforcement.

## Local development

Copy `.env.example` to the ignored `.env` and set the proxy values locally. `ui5-middleware-simpleproxy` 3.7.1 loads this file server-side and supports these variables:

```dotenv
UI5_MIDDLEWARE_SIMPLE_PROXY_BASEURI=https://your-development-sap-host.example/sap
UI5_MIDDLEWARE_SIMPLE_PROXY_USERNAME=your_local_sap_user
UI5_MIDDLEWARE_SIMPLE_PROXY_PASSWORD=REPLACE_WITH_LOCAL_PASSWORD
UI5_MIDDLEWARE_SIMPLE_PROXY_STRICT_SSL=true
```

Do not commit `.env`. Do not use a local technical user as evidence of per-user production auditing. The UI identifies local mode and warns that audit fields belong to the SAP user configured in the server-side proxy.

Start only after entering valid local values:

```bash
npm start
```

## Deployment

Prerequisites: Cloud Foundry CLI, MultiApps plugin, MTA build tool, BTP entitlements for XSUAA/Destination/Connectivity/HTML5 repository, the external `S40` Destination, Cloud Connector mapping, and assigned role collections.

```bash
npm ci
npm test
npm run build
mbt build
cf deploy mta_archives/abap-to-fiori-system_1.0.0.mtar
```

After deployment, open the AppRouter route in a private browser window. An anonymous request must redirect to the configured IdP. After login, `/user-api/currentUser` must return the BTP user and scopes without secrets.

## Required integration verification

Run these checks only after Principal Propagation and the backend current-user contract are configured:

1. Sign in as `DEV-030`; verify `CurrentUser.sapUser=DEV-030` and client `324`.
2. Fetch the OData service root, `$metadata`, an entity list, and a CSRF token. The token response must be 2xx and return a real token rather than `Required`.
3. Execute `Analyze` and verify the returned/persisted `CreatedBy=DEV-030`.
4. Sign out, sign in as `DEV-130`, repeat, and verify `CreatedBy=DEV-130`.
5. Attempt to send `CreatedBy=ADMIN`; SAP must reject or ignore it.
6. Repeat applicable mutation checks for Mail, Chat and Export.
7. Inspect the inner responses in `$batch`, not only its outer status.
8. Verify SAP audit logs record the corresponding SAP user for each request.

These tests are currently **Blocked** because the repository cannot configure the external Destination/Cloud Connector/SICF mapping and contains no ABAP implementation.

## Rollback

For a failed application deployment, redeploy the previously approved MTAR. Revert the AppRouter/XSUAA/connectivity changes through a reviewed source commit and rebuild; do not edit generated MTAR/ZIP files by hand. For Destination, Cloud Connector, trust, or SICF changes, use the BTP/SAP administrator's recorded previous configuration. Never restore a fixed technical user as a production workaround for per-user auditing.
