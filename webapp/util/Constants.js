sap.ui.define([], function () {
  "use strict";

  return {
    EntitySet: {
      SavedReportHeader: "/SavedReportHeader",
      BusinessLogic: "/ZCE_BUSINESS_LOGIC",
      DatabaseTable: "/ZCE_DB_TABLE",
      UIFilter: "/ZCE_UI_FILTER",
      ComparisonResult: "/ZCE_COMPARISON_RESULT"
    },

    Action: {
      AnalyzeAndSave: "/SavedReportHeader/com.sap.gateway.srvd.zui_analyzer_service.v0001.analyzeAndSave"
    },

    Field: {
      ProgramName: "ProgramName",
      ProgramDescription: "ProgramDescription",
      AnalysisStatus: "AnalysisStatus",
      AnalysisStatusCriticality: "AnalysisStatusCriticality",
      MigrationScore: "MigrationScore",
      ComplexityScore: "ComplexityScore",
      CloudReadinessScore: "CloudReadinessScore",
      TotalTables: "TotalTables",
      TotalFilters: "TotalFilters",
      TotalBusinessObjects: "TotalBusinessObjects",
      FieldName: "FieldName",
      Recommendation: "Recommendation",
      MigrationTarget: "MigrationTarget",
      DataElement: "DataElement",
      Description: "Description",
      TableName: "TableName",
      Operations: "Operations",
      CDSCandidate: "CDSCandidate",
      Priority: "Priority",
      MigrationApproach: "MigrationApproach",
      ObjectName: "ObjectName",
      ObjectType: "ObjectType",
      Severity: "Severity",
      RemediationComplexity: "RemediationComplexity",
      FilterType: "FilterType",
      MandatoryFlag: "MandatoryFlag",
      MultiValueFlag: "MultiValueFlag",
      FioriAdaptation: "FioriAdaptation"
    },

    DetailTab: {
      Overview: "overview",
      UIFilters: "uiFilters",
      DatabaseTables: "databaseTables",
      BusinessLogic: "businessLogic",
      ComparisonResults: "comparisonResults"
    },

    Table: {
      Top: 100
    }
  };
});
