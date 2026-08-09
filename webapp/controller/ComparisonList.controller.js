sap.ui.define([
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/m/MessageToast",
  "abap/to/fiori/system/controller/BaseController",
  "abap/to/fiori/system/model/models",
  "abap/to/fiori/system/model/ComparisonConstants",
  "abap/to/fiori/system/model/ComparisonFormatter"
], function (Filter, FilterOperator, MessageToast, BaseController, models, ComparisonConstants, ComparisonFormatter) {
  "use strict";

  return BaseController.extend("abap.to.fiori.system.controller.ComparisonList", {
    comparisonFormatter: ComparisonFormatter,

    onInit: function () {
      this._oViewModel = models.createComparisonUiModel();
      this.getView().setModel(this._oViewModel, "comparisonUi");
      this.getRouter().getRoute(ComparisonConstants.route.history).attachPatternMatched(this._onRouteMatched, this);
    },

    onBackToDashboard: function () {
      this.getRouter().navTo("dashboard");
    },

    onRefresh: function () {
      this._loadRuns();
    },

    onSearch: function () {
      this._loadRuns();
    },

    onClearFilters: function () {
      this._oViewModel.setProperty("/filters", {
        programName: "",
        targetStrategy: "",
        overallStatus: "",
        runStatus: ""
      });
      this._loadRuns();
    },

    onRunPress: function (oEvent) {
      var oContext = (oEvent.getParameter("listItem") || oEvent.getSource()).getBindingContext("comparisonUi");
      var sCmpRunId = oContext && oContext.getProperty("CmpRunId");

      if (!sCmpRunId) {
        MessageToast.show(this.getText("comparisonOpenError"));
        return;
      }

      this.getRouter().navTo(ComparisonConstants.route.detail, {
        cmpRunId: encodeURIComponent(sCmpRunId)
      });
    },

    _onRouteMatched: function () {
      this._loadRuns();
    },

    _loadRuns: function () {
      this._oViewModel.setProperty("/busy", true);
      this._oViewModel.setProperty("/errorMessage", "");

      return this.getComparisonService().getComparisonRuns({
        top: 100,
        filters: this._oViewModel.getProperty("/filters")
      }).then(function (aRuns) {
        this._oViewModel.setProperty("/runs", aRuns || []);
      }.bind(this)).catch(function (oError) {
        this._oViewModel.setProperty("/runs", []);
        this._oViewModel.setProperty("/errorMessage", this.parseError(oError).message || this.getText("comparisonLoadError"));
      }.bind(this)).finally(function () {
        this._oViewModel.setProperty("/busy", false);
      }.bind(this));
    }
  });
});
