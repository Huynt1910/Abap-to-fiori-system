sap.ui.define([
  "sap/ui/Device",
  "sap/ui/model/json/JSONModel"
], function (Device, JSONModel) {
  "use strict";

  return {
    createDeviceModel: function () {
      var oModel = new JSONModel(Device);
      oModel.setDefaultBindingMode("OneWay");
      return oModel;
    },

    createViewModel: function () {
      return new JSONModel({
        busy: false,
        selectedProgram: "",
        selectedAnalysis: {},
        selectedReportCount: 0,
        analysisRows: [],
        analysisCount: 0,
        analysisNoDataText: "Enter a Program Name and press Go",
        newAnalysis: {
          programName: "",
          busy: false
        },
        detail: {
          busy: false,
          programName: "",
          selectedTab: "overview",
          overview: {},
          uiFilters: [],
          uiFiltersCount: 0,
          databaseTables: [],
          databaseTablesCount: 0,
          businessLogic: [],
          businessLogicCount: 0,
          comparisonResults: [],
          comparisonResultsCount: 0
        }
      });
    }
  };
});
