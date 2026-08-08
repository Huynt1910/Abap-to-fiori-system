sap.ui.define([
  "sap/ui/Device",
  "sap/ui/model/json/JSONModel",
  "abap/to/fiori/system/model/AnalysisTableConfig"
], function (Device, JSONModel, AnalysisTableConfig) {
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
      columns: {
        program: true,
        status: true,
        sourceObjects: true,
        dbTables: true,
        alvOutputs: true,
        readinessScore: true,
        createdAt: true,
        createdBy: true
      },
      newAnalysis: {
        programName: "",
        busy: false,
        valueHelp: {
          busy: false,
          search: "",
          errorMessage: "",
          items: []
        }
      }
    });
  }

  function createAnalysisDetailModel() {
    return new JSONModel({
      busy: false,
      analysisId: "",
      selectedTab: "sourceObjects",
      loaded: {
        sourceObjects: false,
        uiFilters: false,
        databaseObjects: false,
        businessLogic: false,
        alvOutputs: false,
        evidences: false,
        recommendations: false,
        messages: false
      },
      loading: {
        sourceObjects: false,
        uiFilters: false,
        databaseObjects: false,
        businessLogic: false,
        alvOutputs: false,
        evidences: false,
        recommendations: false,
        messages: false
      },
      errors: {
        sourceObjects: null,
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
        dialogOpen: false,
        selectedSection: "",
        selectedFields: [],
        availableFields: [],
        fileName: "",
        message: ""
      },
      comparison: {
        busy: false,
        state: "IDLE",
        message: ""
      },
      columns: AnalysisTableConfig.getAllColumnDefaults(),
      tableSettingsState: {},
      selectedAlvOutput: null,
      alvOutputDetail: {
        loading: false,
        error: null,
        columns: [],
        sorts: [],
        filters: [],
        events: []
      },
      selectedRecommendation: null,
      recommendationDetail: {
        loading: false,
        error: null,
        annotations: []
      },
      sourceObjects: [],
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
      columns: {
        jobName: true,
        reportType: true,
        fileFormat: true,
        frequency: true,
        nextRunAt: true,
        recipientCount: true,
        createdBy: true,
        createdAt: true,
        actions: true
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

  function createComparisonUiModel() {
    return new JSONModel({
      busy: false,
      actionBusy: false,
      errorMessage: "",
      selectedAnalysisId: "",
      selectedRunId: "",
      filters: {
        programName: "",
        targetStrategy: "",
        overallStatus: "",
        runStatus: ""
      },
      itemFilters: {
        category: "",
        status: "",
        severity: ""
      },
      progress: {
        state: "IDLE",
        message: ""
      },
      runs: [],
      run: {},
      items: [],
      selectedItem: null
    });
  }

  return {
    createDeviceModel: createDeviceModel,
    createDashboardModel: createDashboardModel,
    createAnalysisDetailModel: createAnalysisDetailModel,
    createMailUiModel: createMailUiModel,
    createComparisonUiModel: createComparisonUiModel
  };
});
