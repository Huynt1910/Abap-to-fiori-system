sap.ui.define([], function () {
  "use strict";

  return Object.freeze({
    service: Object.freeze({
      // Backend must confirm the service root. This follows the deployed OData V4 service naming used by the app.
      root: "/sap/opu/odata4/sap/zui_mig_cmp_o4/srvd/sap/zui_mig_cmp/0001/",
      namespace: "com.sap.gateway.srvd.zui_mig_cmp.v0001",
      sapClient: "324"
    }),

    entitySet: Object.freeze({
      runs: "/ComparisonRuns",
      items: "/ComparisonItems"
    }),

    navigation: Object.freeze({
      items: "_Items"
    }),

    action: Object.freeze({
      executeComparison: "/ComparisonRuns/com.sap.gateway.srvd.zui_mig_cmp.v0001.ExecuteComparison(...)"
    }),

    route: Object.freeze({
      history: "comparisonHistory",
      detail: "comparisonDetail"
    }),

    polling: Object.freeze({
      intervalMs: 2000,
      timeoutMs: 60000
    }),

    progressState: Object.freeze({
      idle: "IDLE",
      submitting: "SUBMITTING",
      discoveringRun: "DISCOVERING_RUN",
      running: "RUNNING",
      completed: "COMPLETED",
      failed: "FAILED",
      timeout: "TIMEOUT"
    }),

    runStatus: Object.freeze({
      queued: "QUEUED",
      running: "RUNNING",
      processing: "PROCESSING",
      completed: "COMPLETED",
      success: "SUCCESS",
      failed: "FAILED",
      error: "ERROR"
    }),

    field: Object.freeze({
      runId: "CmpRunId",
      analysisId: "AnalysisId",
      programName: "ProgramName",
      targetStrategy: "TargetStrategy",
      overallStatus: "OverallStatus",
      runStatus: "RunStatus",
      createdAt: "CreatedAt",
      runs: Object.freeze([
        "CmpRunId",
        "AnalysisId",
        "ProgramName",
        "TargetStrategy",
        "TotalItems",
        "MappedCount",
        "RefactorCount",
        "ManualCount",
        "UnsupportedCount",
        "CompatibilityRate",
        "OverallStatus",
        "RunStatus",
        "ErrorMessage",
        "CreatedBy",
        "CreatedAt",
        "LastChangedBy",
        "LastChangedAt"
      ]),
      items: Object.freeze([
        "CmpRunId",
        "ItemId",
        "ItemNo",
        "Category",
        "SourceElement",
        "SourceType",
        "SourceValue",
        "TargetElement",
        "TargetType",
        "TargetValue",
        "MappingRule",
        "Status",
        "Severity",
        "Message",
        "Recommendation",
        "CreatedAt"
      ])
    })
  });
});
