sap.ui.define([], function () {
  "use strict";

  return Object.freeze({
    service: Object.freeze({
      root: "/sap/opu/odata4/sap/zui_mig_analysis_o4/srvd/sap/zui_mig_analysis/0001/",
      namespace: "com.sap.gateway.srvd.zui_mig_analysis.v0001",
      sapClient: "324"
    }),

    entitySet: Object.freeze({
      analyses: "/Analyses",
      uiFilters: "/UiFilters",
      databaseObjects: "/DatabaseObjects",
      businessLogic: "/BusinessLogic",
      alvOutputs: "/AlvOutputs",
      evidences: "/Evidences",
      recommendations: "/Recommendations",
      analysisMessages: "/AnalysisMessages",
      exportResult: "/ExportResult"
    }),

    navigation: Object.freeze({
      uiFilters: "_UiFilters",
      databaseObjects: "_DatabaseObjects",
      businessLogic: "_BusinessLogic",
      alvOutputs: "_AlvOutputs",
      evidences: "_Evidences",
      recommendations: "_Recommendations",
      messages: "_Messages"
    }),

    action: Object.freeze({
      analyzeHttpPath: "/Analyses/com.sap.gateway.srvd.zui_mig_analysis.v0001.Analyze",
      analyzeBindingPath: "/Analyses/com.sap.gateway.srvd.zui_mig_analysis.v0001.Analyze(...)"
    }),

    fileFormat: Object.freeze({
      excel: "X",
      pdf: "P",
      csv: "C"
    }),

    exportSection: Object.freeze({
      all: "ALL",
      overview: "OVERVIEW",
      uiFilter: "UI_FILTER",
      databaseObjects: "DB_OBJ",
      businessLogic: "BUS_LOGIC",
      alvOutput: "ALV_OUTPUT",
      sourceEvidence: "SRC_EVIDEN",
      recommendations: "RECOMMEN",
      messages: "MESSAGE"
    }),

    field: Object.freeze({
      analysisId: "AnalysisId",
      programName: "ProgramName",
      status: "Status",
      createdAt: "CreatedAt",
      analyses: Object.freeze([
        "AnalysisId",
        "ProgramName",
        "ProgramDescription",
        "Status",
        "TotalSourceObjects",
        "TotalUiFilters",
        "TotalDatabaseObjects",
        "TotalBusinessLogic",
        "TotalAlvOutputs",
        "TotalAlvColumns",
        "TotalRecommendations",
        "ComplexityScore",
        "ReadinessScore",
        "ParserVersion",
        "RuleVersion",
        "SourceHash",
        "CreatedBy",
        "CreatedAt",
        "LastChangedBy",
        "LocalLastChangedAt"
      ]),
      uiFilters: Object.freeze([
        "AnalysisId",
        "ItemId",
        "EvidenceId",
        "FieldName",
        "FieldKind",
        "ReferenceTable",
        "ReferenceField",
        "DataElement",
        "DataType",
        "Description",
        "SelectionBlock",
        "Mandatory",
        "Hidden",
        "Checkbox",
        "RadioGroup",
        "MultipleSelection",
        "RangeSupported",
        "DefaultValue",
        "ValidationRoutine",
        "Confidence"
      ]),
      databaseObjects: Object.freeze([
        "AnalysisId",
        "ItemId",
        "EvidenceId",
        "ObjectName",
        "ObjectType",
        "Operation",
        "SelectedFields",
        "WhereFields",
        "JoinedObjects",
        "JoinCondition",
        "Aggregation",
        "ContainingRoutine",
        "DynamicAccess",
        "ReadOnly",
        "PagingCapability",
        "Description",
        "Confidence"
      ]),
      businessLogic: Object.freeze([
        "AnalysisId",
        "ItemId",
        "EvidenceId",
        "ObjectName",
        "ObjectType",
        "ContainerName",
        "CallingRoutine",
        "InterfaceSummary",
        "Description",
        "SideEffect",
        "TransactionDependency",
        "GuiDependency",
        "ReuseFeasibility",
        "Confidence"
      ]),
      recommendations: Object.freeze([
        "AnalysisId",
        "RecommendationId",
        "SourceItemId",
        "EvidenceId",
        "RuleId",
        "RuleVersion",
        "TargetLayer",
        "Title",
        "DisplayText",
        "Explanation",
        "Severity",
        "Confidence",
        "ReviewStatus",
        "ManualReview"
      ]),
      evidences: Object.freeze([
        "AnalysisId",
        "EvidenceId",
        "SourceObject",
        "StartLine",
        "EndLine",
        "StatementId",
        "StatementText",
        "Confidence"
      ]),
      messages: Object.freeze([
        "AnalysisId",
        "MessageNo",
        "MessageType",
        "MessageCode",
        "SourceObject",
        "SourceLine",
        "MessageText"
      ]),
      alvOutputs: Object.freeze([
        "AnalysisId",
        "OutputId",
        "EvidenceId",
        "LayoutEvidenceId",
        "OutputName",
        "OutputKind",
        "Framework",
        "ControlObject",
        "OutputTable",
        "RowType",
        "FieldCatalog",
        "SortTable",
        "FilterTable",
        "LayoutObject",
        "VariantObject",
        "Editable",
        "Hierarchical",
        "Zebra",
        "AutoWidth",
        "SelectionMode",
        "Confidence"
      ])
    }),

    section: Object.freeze({
      uiFilters: "uiFilters",
      databaseObjects: "databaseObjects",
      businessLogic: "businessLogic",
      alvOutputs: "alvOutputs",
      evidences: "evidences",
      recommendations: "recommendations",
      messages: "messages"
    })
  });
});
