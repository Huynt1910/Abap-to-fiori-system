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
        status: ""
      },
      visibleCount: 0,
      selectedCount: 0,
      kpi: {
        total: 0,
        completed: 0,
        warning: 0,
        error: 0
      },
      newAnalysis: {
        programName: "",
        busy: false
      }
    });
  }

  function createAnalysisDetailModel() {
    return new JSONModel({
      busy: false,
      analysisId: "",
      selectedTab: "uiFilters",
      loaded: {
        uiFilters: false,
        databaseObjects: false,
        businessLogic: false,
        alvOutputs: false,
        evidences: false,
        recommendations: false,
        messages: false
      },
      loading: {
        uiFilters: false,
        databaseObjects: false,
        businessLogic: false,
        alvOutputs: false,
        evidences: false,
        recommendations: false,
        messages: false
      },
      errors: {
        uiFilters: null,
        databaseObjects: null,
        businessLogic: null,
        alvOutputs: null,
        evidences: null,
        recommendations: null,
        messages: null
      },
      overview: {},
      export: {
        busy: false,
        fileFormat: "X",
        exportSection: "ALL",
        reportType: "",
        dialogOpen: false
      },
      selectedRecommendation: null,
      uiFilters: [],
      databaseObjects: [],
      businessLogic: [],
      alvOutputs: [],
      evidences: [],
      recommendations: [],
      messages: [],
      counts: {}
    });
  }

  function createMailUiModel() {
    return new JSONModel({
      busy: false,
      listBusy: false,
      sendBusyJobId: null,
      selectedJobId: null,
      recipientCounts: {},
      filters: {
        search: "",
        frequency: "",
        fileFormat: ""
      },
      wizard: {
        busy: false,
        mode: "create",
        errorMessage: "",
        job: {},
        recipients: [],
        newRecipient: {
          RecipientType: "T",
          SapUser: ""
        },
        activateAfterCreate: false
      },
      recipient: {
        busy: false,
        mode: "create",
        jobId: "",
        data: {}
      },
      logs: [],
      errors: {}
    });
  }

  return {
    createDeviceModel: createDeviceModel,
    createDashboardModel: createDashboardModel,
    createAnalysisDetailModel: createAnalysisDetailModel,
    createMailUiModel: createMailUiModel
  };
});
