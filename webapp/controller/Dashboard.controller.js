sap.ui.define([
  "sap/ui/core/Fragment",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/model/Sorter",
  "sap/m/MessageToast",
  "abap/to/fiori/system/controller/BaseController",
  "abap/to/fiori/system/model/models",
  "abap/to/fiori/system/util/Constants",
  "abap/to/fiori/system/util/formatter"
], function (Fragment, Filter, FilterOperator, Sorter, MessageToast, BaseController, models, Constants, formatter) {
  "use strict";

  return BaseController.extend("abap.to.fiori.system.controller.Dashboard", {
    formatter: formatter,

    onInit: function () {
      this._oViewModel = models.createDashboardModel();
      this.getView().setModel(this._oViewModel, "dashboard");
      this._applyAnalysisFilters();
    },

    onSearch: function () {
      this._applyAnalysisFilters();
    },

    onRefresh: function () {
      this._refreshAnalyses();
    },

    onClearFilters: function () {
      this._oViewModel.setProperty("/filters/search", "");
      this._oViewModel.setProperty("/filters/status", "");
      this._oViewModel.setProperty("/filters/latestOnly", true);
      this._applyAnalysisFilters();
    },

    onAnalysesUpdateFinished: function (oEvent) {
      this._oViewModel.setProperty("/visibleCount", oEvent.getParameter("total") || 0);
    },

    onRunAnalysis: function () {
      this._resetRunAnalysisState();
      this._openRunAnalysisDialog();
    },

    onCancelRunAnalysis: function () {
      this.byId("runAnalysisDialog").close();
    },

    onExecuteRunAnalysis: function () {
      var oProgram = this._oViewModel.getProperty("/newAnalysis/program") || {};
      var sRootProgram = String(this._oViewModel.getProperty("/newAnalysis/rootProgram") || oProgram.RootProgram || "").trim();
      var sDescription = String(this._oViewModel.getProperty("/newAnalysis/description") || "").trim();

      if (!sRootProgram) {
        MessageToast.show(this.getText("validationRootProgramRequired"));
        return;
      }

      if (!sDescription) {
        MessageToast.show(this.getText("validationProgramDescriptionRequired"));
        return;
      }

      this._oViewModel.setProperty("/newAnalysis/busy", true);
      this.getAnalysisService().runAnalysis(sRootProgram, sDescription)
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

    onProgramValueHelp: function () {
      this._openProgramValueHelpDialog();
    },

    onRootProgramChange: function (oEvent) {
      var sRootProgram = String(oEvent.getParameter("value") || "").trim();

      this._oViewModel.setProperty("/newAnalysis/rootProgram", sRootProgram);
      this._oViewModel.setProperty("/newAnalysis/program", sRootProgram ? {
        RootProgram: sRootProgram
      } : null);
    },

    onProgramValueHelpSearch: function (oEvent) {
      this._searchPrograms(oEvent.getParameter("value"));
    },

    onProgramValueHelpConfirm: function (oEvent) {
      var oSelectedItem = oEvent.getParameter("selectedItem");
      var oContext = oSelectedItem && oSelectedItem.getBindingContext("dashboard");
      var oProgram = oContext && oContext.getObject();

      if (oProgram) {
        this._oViewModel.setProperty("/newAnalysis/program", oProgram);
        this._oViewModel.setProperty("/newAnalysis/rootProgram", oProgram.RootProgram || "");
        this._oViewModel.setProperty("/newAnalysis/description", oProgram.Description || "");
      }
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

      if (this._oViewModel.getProperty("/filters/latestOnly")) {
        aFilters.push(new Filter(Constants.field.isLatest, FilterOperator.EQ, true));
      }

      if (sSearch) {
        aFilters.push(new Filter(Constants.field.rootProgram, FilterOperator.Contains, sSearch));
      }

      if (sStatus) {
        aFilters.push(new Filter("AnalysisStatus", FilterOperator.EQ, sStatus));
      }

      return aFilters;
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

    _openProgramValueHelpDialog: function () {
      if (!this._pProgramValueHelpDialog) {
        this._pProgramValueHelpDialog = Fragment.load({
          id: this.getView().getId(),
          name: "abap.to.fiori.system.view.fragments.ProgramValueHelp",
          controller: this
        }).then(function (oDialog) {
          this.getView().addDependent(oDialog);
          return oDialog;
        }.bind(this));
      }

      this._pProgramValueHelpDialog.then(function (oDialog) {
        oDialog.open();
        this._searchPrograms(this._oViewModel.getProperty("/newAnalysis/rootProgram"));
      }.bind(this));
    },

    _searchPrograms: function (sQuery) {
      this._oViewModel.setProperty("/programValueHelpBusy", true);

      return this.getProgramService().searchPrograms(String(sQuery || "").trim())
        .then(function (aPrograms) {
          this._oViewModel.setProperty("/programValueHelp", aPrograms);
        }.bind(this))
        .catch(function (oError) {
          this.showError(oError, "programSearchError");
        }.bind(this))
        .finally(function () {
          this._oViewModel.setProperty("/programValueHelpBusy", false);
        }.bind(this));
    },

    _resetRunAnalysisState: function () {
      this._oViewModel.setProperty("/newAnalysis/rootProgram", "");
      this._oViewModel.setProperty("/newAnalysis/program", null);
      this._oViewModel.setProperty("/newAnalysis/description", "");
      this._oViewModel.setProperty("/newAnalysis/busy", false);
    }
  });
});
