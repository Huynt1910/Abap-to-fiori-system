sap.ui.define([
  "sap/ui/Device",
  "sap/ui/model/json/JSONModel"
], function (Device, JSONModel) {
  "use strict";

  function createDeviceModel() {
    var oDeviceModel = new JSONModel(Device);
    oDeviceModel.setDefaultBindingMode("OneWay");
    return oDeviceModel;
  }

  function createDashboardModel() {
    return new JSONModel({
      busy: false,
      filters: {
        search: "",
        status: "",
        latestOnly: true
      },
      visibleCount: 0,
      selectedCount: 0,
      programValueHelpBusy: false,
      newAnalysis: {
        rootProgram: "",
        program: null,
        description: "",
        busy: false
      },
      programValueHelp: []
    });
  }

  function createAnalysisDetailModel() {
    return new JSONModel({
      busy: false,
      analysisId: "",
      selectedTab: "overview",
      loaded: {
        overview: false,
        complexity: false,
        recommendations: false,
        issues: false,
        database: false,
        businessLogic: false,
        dependencyGraph: false,
        document: false,
        history: false
      },
      loading: {
        complexity: false,
        recommendations: false
      },
      errors: {
        complexity: null,
        recommendations: null
      },
      overview: {},
      summary: {},
      complexity: null,
      recommendations: [],
      selectedRecommendation: null,
      issues: [],
      databaseAccesses: [],
      databaseReferences: [],
      calls: [],
      routines: [],
      scopes: [],
      nodes: [],
      edges: [],
      document: null,
      history: [],
      counts: {}
    });
  }

  return {
    createDeviceModel: createDeviceModel,
    createDashboardModel: createDashboardModel,
    createAnalysisDetailModel: createAnalysisDetailModel
  };
});
