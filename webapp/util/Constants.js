sap.ui.define([], function () {
  "use strict";

  return Object.freeze({
    entitySet: Object.freeze({
      analysis: "/Analysis",
      summary: "/AnalysisSummary",
      documents: "/Documents",
      issues: "/AnalysisIssue",
      calls: "/AnalysisCall",
      routines: "/AnalysisRoutine",
      scopes: "/AnalysisScope",
      nodes: "/AnalysisNode",
      edges: "/AnalysisEdge",
      databaseAccess: "/DatabaseAccess",
      databaseReference: "/DatabaseReference",
      programValueHelp: "/ProgramValueHelp",
      complexity: "/Complexity",
      recommendation: "/Recommendation"
    }),

    association: Object.freeze({
      summary: "_Summary",
      document: "_Document",
      issues: "_Issues",
      calls: "_Calls",
      routines: "_Routines",
      scopes: "_Scopes",
      nodes: "_Nodes",
      edges: "_Edges",
      databaseAccesses: "_DbAccesses",
      databaseReferences: "_DbRefs",
      complexity: "_Complexity",
      recommendations: "_Recommendation"
    }),

    action: Object.freeze({
      runAnalysis: "com.sap.gateway.srvd.zui_mig2_analysis.v0001.RunAnalysis",
      reanalyze: "com.sap.gateway.srvd.zui_mig2_analysis.v0001.Reanalyze",
      generateDocument: "com.sap.gateway.srvd.zui_mig2_analysis.v0001.GenerateDocument"
    }),

    field: Object.freeze({
      analysisId: "AnalysisId",
      rootProgram: "RootProgram",
      isLatest: "IsLatest",
      createdAt: "CreatedAt"
    }),

    section: Object.freeze({
      overview: "overview",
      complexity: "complexity",
      recommendations: "recommendations",
      issues: "issues",
      database: "database",
      businessLogic: "businessLogic",
      dependencyGraph: "dependencyGraph",
      document: "document",
      history: "history"
    })
  });
});
