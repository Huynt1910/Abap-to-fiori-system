sap.ui.define([
  "sap/ui/core/Fragment",
  "sap/ui/core/routing/HashChanger",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/model/Sorter",
  "sap/m/MessageToast",
  "abap/to/fiori/system/controller/BaseController",
  "abap/to/fiori/system/model/models",
  "abap/to/fiori/system/util/Constants",
  "abap/to/fiori/system/util/formatter"
], function (Fragment, HashChanger, Filter, FilterOperator, Sorter, MessageToast, BaseController, models, Constants, formatter) {
  "use strict";

  return BaseController.extend("abap.to.fiori.system.controller.Dashboard", {
    formatter: formatter,

    onInit: function () {
      this._oViewModel = models.createDashboardModel();
      this.getView().setModel(this._oViewModel, "dashboard");
      this._applyAnalysisFilters();
      this._updateDashboardKpis();
      this._displayMailTargetFromHash();
    },

    onSearch: function () {
      this._applyAnalysisFilters();
    },

    onRefresh: function () {
      this._refreshAnalyses();
    },

    onOpenMailJobs: function () {
      this._displayMailJobs();
    },

    onClearFilters: function () {
      this._oViewModel.setProperty("/filters/search", "");
      this._oViewModel.setProperty("/filters/status", "");
      this._applyAnalysisFilters();
    },

    onAnalysesUpdateFinished: function (oEvent) {
      var iTotal = oEvent.getParameter("total") || 0;
      this._oViewModel.setProperty("/visibleCount", iTotal);
      this._updateDashboardKpis();
    },

    onRunAnalysis: function () {
      this._resetRunAnalysisState();
      this._openRunAnalysisDialog();
    },

    onCancelRunAnalysis: function () {
      this.byId("runAnalysisDialog").close();
    },

    onExecuteRunAnalysis: function () {
      var sProgramName = String(this._oViewModel.getProperty("/newAnalysis/programName") || "").trim();

      if (!sProgramName) {
        MessageToast.show(this.getText("validationProgramNameRequired"));
        return;
      }

      this._oViewModel.setProperty("/newAnalysis/busy", true);
      this.getAnalysisService().analyzeProgram(sProgramName)
        .then(function (oAnalysis) {
          var sAnalysisId = oAnalysis && oAnalysis.AnalysisId;

          this.byId("runAnalysisDialog").close();
          MessageToast.show(this.getText("runAnalysisSuccess"));
          this._refreshAnalyses();

          if (sAnalysisId) {
            this.getRouter().navTo("analysisDetail", {
              analysisId: sAnalysisId
            });
          }
        }.bind(this))
        .catch(function (oError) {
          this.showError(oError, "runAnalysisError");
        }.bind(this))
        .finally(function () {
          this._oViewModel.setProperty("/newAnalysis/busy", false);
        }.bind(this));
    },

    onProgramNameChange: function (oEvent) {
      this._oViewModel.setProperty("/newAnalysis/programName", String(oEvent.getParameter("value") || "").trim());
    },

    onAnalysisPress: function (oEvent) {
      var oListItem = oEvent.getParameter("listItem") || oEvent.getSource();
      var oContext = oListItem && oListItem.getBindingContext();
      var sAnalysisId = oContext && oContext.getProperty("AnalysisId");

      if (!sAnalysisId) {
        MessageToast.show(this.getText("openAnalysisError"));
        return;
      }

      this.getRouter().navTo("analysisDetail", {
        analysisId: encodeURIComponent(sAnalysisId)
      });
    },

    _applyAnalysisFilters: function () {
      var oTable = this.byId("analysisTable");
      var oBinding = oTable && oTable.getBinding("items");
      var aFilters = this._buildFilters();

      if (oBinding) {
        oBinding.filter(aFilters);
        oBinding.sort([new Sorter(Constants.field.createdAt, true)]);
      }
      this._updateDashboardKpis();
    },

    _refreshAnalyses: function () {
      var oBinding = this.byId("analysisTable").getBinding("items");

      this._applyAnalysisFilters();

      if (oBinding) {
        oBinding.refresh();
      }
    },

    _buildFilters: function () {
      var aFilters = [];
      var sSearch = String(this._oViewModel.getProperty("/filters/search") || "").trim();
      var sStatus = String(this._oViewModel.getProperty("/filters/status") || "").trim();

      if (sSearch) {
        aFilters.push(new Filter(Constants.field.programName, FilterOperator.Contains, sSearch));
      }

      if (sStatus) {
        aFilters.push(new Filter(Constants.field.status, FilterOperator.EQ, sStatus));
      }

      return aFilters;
    },

    _updateDashboardKpis: function () {
      this._oViewModel.setProperty("/busy", true);
      this.getAnalysisService().readAnalysisSummary()
        .then(function (oKpi) {
          this._oViewModel.setProperty("/kpi", oKpi);
        }.bind(this))
        .catch(function (oError) {
          this.showError(oError, "loadOverviewError");
        }.bind(this))
        .finally(function () {
          this._oViewModel.setProperty("/busy", false);
        }.bind(this));
    },

    _displayMailTargetFromHash: function () {
      var sHash = HashChanger.getInstance().getHash();

      if (/^\/?mail($|\/)/.test(sHash)) {
        setTimeout(function () {
          this._displayMailJobs(true);
        }.bind(this), 0);
      }
    },

    _displayMailJobs: function (bKeepHash) {
      var vDisplayResult;

      try {
        vDisplayResult = this.getRouter().getTargets().display("mailJobs");

        if (vDisplayResult && typeof vDisplayResult.catch === "function") {
          vDisplayResult.catch(function (oError) {
            this.showError(oError, "openMailJobsError");
          }.bind(this));
        }

        if (!bKeepHash) {
          HashChanger.getInstance().setHash("mail");
        }
      } catch (oError) {
        this.showError(oError, "openMailJobsError");
      }
    },

    _openRunAnalysisDialog: function () {
      if (!this._pRunAnalysisDialog) {
        this._pRunAnalysisDialog = Fragment.load({
          id: this.getView().getId(),
          name: "abap.to.fiori.system.view.fragments.RunAnalysisDialog",
          controller: this
        }).then(function (oDialog) {
          this.getView().addDependent(oDialog);
          return oDialog;
        }.bind(this));
      }

      this._pRunAnalysisDialog.then(function (oDialog) {
        oDialog.open();
      });
    },

    _resetRunAnalysisState: function () {
      this._oViewModel.setProperty("/newAnalysis/programName", "");
      this._oViewModel.setProperty("/newAnalysis/busy", false);
    }
  });
});
