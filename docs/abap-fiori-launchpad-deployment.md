# Deploy to SAP Fiori Launchpad on ABAP

## Resulting authentication flow

```text
Browser -> SAP Fiori Launchpad -> SAP authenticated session -> SAPUI5 app -> OData V4
```

The Launchpad owns login, session renewal and logout. The application does not show or store an SAP password. Because the UI5 application and `/sap/opu/odata4/...` services use the same ABAP origin and client 324, requests use the logged-in SAP session.

`AuthenticationService` detects `sap.ushell.Container` before its localhost or BTP modes. It reads the Launchpad user for display and delegates logout to the shell. This identity is still not used to write `CreatedBy`; the OData backend must obtain audit identity from its authenticated ABAP execution context.

## Repository deployment configuration

- Component ID: `abap.to.fiori.system`
- Semantic object: `ABAPMigrationAnalyzer`
- Action: `display`
- Proposed BSP repository name: `ZMIGANALYSIS`
- SAP client: `324`
- Deployment config: `ui5-deploy-abap.yaml`
- Deployment tooling: `@sap/ux-ui5-tooling`

Before deploying, replace these two bookmarks in `ui5-deploy-abap.yaml`:

```yaml
package: REPLACE_WITH_ABAP_PACKAGE
transport: REPLACE_WITH_TRANSPORT
```

The package and transport cannot be inferred from this repository. The Fiori/ABAP administrator must provide them and confirm that `ZMIGANALYSIS` is not already used by another BSP application.

Deployment credentials are read from the ignored `.env` through:

```dotenv
UI5_MIDDLEWARE_SIMPLE_PROXY_BASEURI=https://YOUR_SAP_HOST
UI5_MIDDLEWARE_SIMPLE_PROXY_USERNAME=YOUR_DEPLOYMENT_USER
UI5_MIDDLEWARE_SIMPLE_PROXY_PASSWORD=YOUR_LOCAL_PASSWORD
```

The same base URL variable used by the local proxy identifies the deployment target. Use a deployment user with repository/package/transport authorization. These values are only used by local deployment tooling; they are not included in the built application and are unrelated to the end-user login.

Certificate verification remains enabled. Install the correct CA certificate locally if the development system certificate is not trusted.

## Deploy the UI5 application

First perform the deployment test mode:

```bash
npm ci
npm test
npm run deploy:abap:test
```

Review the proposed repository operations, then deploy:

```bash
npm run deploy:abap
```

Do not execute deployment while the package and transport bookmarks remain unchanged.

The SAPUI5 ABAP Repository service must be active and the deployment user must be authorized to call it. SAP Fiori tools upload the built `dist` application to the ABAP UI5 repository; SAP describes this deployment model in [Deploying an Application](https://help.sap.com/docs/bas/developing-sap-fiori-app-in-sap-business-application-studio/deploying-application).

## Register the app in Fiori Launchpad

Use the Launchpad App Manager and Content Manager available in the target SAP release. Create a transportable app descriptor item/target mapping with:

| Field | Value |
| --- | --- |
| Application type | SAPUI5 Fiori App |
| Semantic object | `ABAPMigrationAnalyzer` |
| Action | `display` |
| SAPUI5 component | `abap.to.fiori.system` |
| BSP application | `ZMIGANALYSIS` |
| Title | Migration Analyses |
| Icon | `sap-icon://business-objects-experience` |
| Device types | Desktop, tablet, phone |

SAP requires the tile and target mapping to use the same intent. The target mapping resolves `ABAPMigrationAnalyzer-display` to this SAPUI5 component. See [Creating and Configuring Tiles and Target Mappings](https://help.sap.com/docs/ABAP_PLATFORM_NEW/dd52b271fd064d84b4085a87209cb1bd/41d314ce17b64e6ead05497d6dbbce84.html?version=202210.000).

Then:

1. Add the app descriptor item to a technical catalog.
2. Reference it from the required business catalog.
3. Add the tile to a Launchpad page/space, or group on older releases.
4. Assign the catalog and space/page through a PFCG role.
5. Assign that role only to the intended SAP users.

SAP documents this catalog-to-role flow in [Setting Up Navigation](https://help.sap.com/docs/ABAP_PLATFORM_NEW/a7b390faab1140c087b8926571e942b7/03dbca33e25b44398e13be2f77082e79.html).

## Required SAP authorization

Tile visibility does not authorize OData operations. Each user also needs:

- Launchpad catalog/page/space authorization through PFCG.
- Start authorization for the three OData V4 service groups.
- Business authorization for reading analysis data and executing Analyze, Comparison, Export, Mail and Chat operations according to the user's job role.
- Authorization for any called ABAP programs or objects required by the analysis backend.

Remove any fixed service user from the effective SICF logon configuration for these services. Otherwise SAP will continue to record that technical user rather than the person logged into Launchpad.

## Validation

1. Open the ABAP Fiori Launchpad URL with `sap-client=324` in a private browser window.
2. Log in as a normal SAP user and open the `Migration Analyses` tile.
3. Confirm the header shows the Launchpad user and the application makes no call to `/user-api/currentUser`.
4. Confirm service root, `$metadata` and entity GET requests are same-origin and return 2xx.
5. Execute a modifying operation and confirm token fetch returns 2xx with a real `X-CSRF-Token`, followed by a successful `$batch` using the same SAP session.
6. Inspect individual `$batch` responses for hidden 401/403 errors.
7. Test separately with `DEV-030` and `DEV-130`; verify backend `CreatedBy` and SAP audit logs contain the corresponding execution user.
8. Send a forged `CreatedBy=ADMIN`; the backend must reject or ignore it.
9. Use the Launchpad user menu to log out and verify the SAP session can no longer access the app or OData service.

The two-user audit test remains blocked until backend source/current-user verification and SAP role assignments are available.

## Rollback

To roll back application code, deploy the previously approved application build to the same BSP repository and transport it through the landscape. To remove access without deleting the application, remove the catalog/page assignment from the PFCG role. Use `npm run undeploy:abap` only after explicit administrator approval because it deletes the BSP application from the target repository.
