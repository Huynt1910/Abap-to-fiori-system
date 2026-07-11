sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/UIComponent",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "abap/to/fiori/system/util/formatter",
  "abap/to/fiori/system/util/Constants"
], function (Controller, UIComponent, MessageBox, MessageToast, formatter, Constants) {
  "use strict";

  return Controller.extend("abap.to.fiori.system.controller.Dashboard", {
    formatter: formatter,

    onInit: function () {
      this._oViewModel = this.getOwnerComponent().getModel("view");
      this._oODataService = this.getOwnerComponent().getODataService();

      this._applyAnalysisRows([], false, false);
      this._loadSavedReports();
    },

    onAnalyze: function () {
      var sProgramName = String(this._oViewModel.getProperty("/selectedProgram") || "").trim();

      this._setSelectedProgram(sProgramName);
      this._loadSavedReports(sProgramName);
    },

    onRefresh: function () {
      this._loadSavedReports(this._oViewModel.getProperty("/selectedProgram"));
    },

    onAdaptFilters: function () {
      MessageToast.show("Program Name is the active filter.");
    },

    onReportSelectionChange: function () {
      var oTable = this.byId("analysisTable");
      var iSelectedCount = oTable ? oTable.getSelectedItems().length : 0;

      this._oViewModel.setProperty("/selectedReportCount", iSelectedCount);
    },

    onDeleteSelectedReports: function () {
      var aSelectedReports = this._getSelectedReports();

      if (!aSelectedReports.length) {
        MessageToast.show("Select at least one report to delete.");
        return;
      }

      MessageBox.warning("Delete " + aSelectedReports.length + " selected report(s)?", {
        actions: [MessageBox.Action.DELETE, MessageBox.Action.CANCEL],
        emphasizedAction: MessageBox.Action.DELETE,
        onClose: function (sAction) {
          if (sAction === MessageBox.Action.DELETE) {
            this._deleteSelectedReports(aSelectedReports);
          }
        }.bind(this)
      });
    },

    onOpenNewAnalysis: function () {
      this._oViewModel.setProperty("/newAnalysis/programName", this._oViewModel.getProperty("/selectedProgram") || "");
      this.byId("newAnalysisDialog").open();
    },

    onCancelNewAnalysis: function () {
      this.byId("newAnalysisDialog").close();
      this._oViewModel.setProperty("/newAnalysis/busy", false);
    },

    onCreateNewAnalysis: function () {
      var sProgramName = String(this._oViewModel.getProperty("/newAnalysis/programName") || "").trim();

      if (!sProgramName) {
        MessageToast.show("Enter a Program Name first.");
        return;
      }

      this._oViewModel.setProperty("/newAnalysis/busy", true);
      this._setBusy(true);

      this._oODataService.analyzeAndSave(sProgramName)
        .then(function (oReport) {
          this._setSelectedProgram(oReport.ProgramName || sProgramName);
          this._addOrReplaceAnalysisRow(oReport);
          this.byId("newAnalysisDialog").close();
          MessageToast.show("New analysis created.");
        }.bind(this))
        .catch(function (oError) {
          console.error("Error creating analysis:", oError);
          MessageToast.show(oError.message || "Could not create analysis.");
        })
        .finally(function () {
          this._oViewModel.setProperty("/newAnalysis/busy", false);
          this._setBusy(false);
        }.bind(this));
    },

    onTableRowPress: function (oEvent) {
      var oListItem = oEvent.getParameter("listItem") || oEvent.getSource();
      var oContext = oListItem.getBindingContext("view");
      var oRow = oContext && oContext.getObject();
      var sProgramName = oRow && oRow.ProgramName;

      if (!sProgramName) {
        MessageToast.show("Could not open detail for this row.");
        return;
      }

      this._oViewModel.setProperty("/selectedAnalysis", oRow);
      this._setSelectedProgram(sProgramName);

      console.log("Opening detail page for ProgramName:", sProgramName);
      UIComponent.getRouterFor(this).navTo("detail", {
        "programName*": encodeURIComponent(sProgramName)
      });
    },

    _applyAnalysisRows: function (aRows, bUseFirstRowAsSelected, bAfterSearch) {
      var aData = aRows || [];

      this._oViewModel.setProperty("/analysisRows", aData);
      this._oViewModel.setProperty("/analysisCount", aData.length);
      this._oViewModel.setProperty("/analysisNoDataText", aData.length || bAfterSearch ? "No saved reports available." : "Loading saved reports...");
      this._oViewModel.setProperty("/selectedAnalysis", bUseFirstRowAsSelected && aData.length ? aData[0] : {});
      this._clearReportSelection();
    },

    _loadSavedReports: function (sProgramName) {
      var sFilterProgramName = String(sProgramName || "").trim();

      this._setBusy(true);
      this._oODataService.readSavedReportHeaders(sFilterProgramName)
        .then(function (aRows) {
          this._applyAnalysisRows(aRows, true, true);

          if (!aRows.length && sFilterProgramName) {
            MessageToast.show("No saved reports found for " + sFilterProgramName + ".");
          }
        }.bind(this))
        .catch(function (oError) {
          console.error("Error reading saved reports:", oError);
          this._applyAnalysisRows([], false, true);
          MessageToast.show(oError.message || "Could not read saved reports.");
        }.bind(this))
        .finally(function () {
          this._setBusy(false);
        }.bind(this));
    },

    _addOrReplaceAnalysisRow: function (oReport) {
      var aRows = (this._oViewModel.getProperty("/analysisRows") || []).slice();
      var sReportId = oReport && oReport.ReportID;
      var iExistingIndex = aRows.findIndex(function (oRow) {
        return sReportId && oRow.ReportID === sReportId;
      });

      if (!oReport) {
        return;
      }

      if (iExistingIndex >= 0) {
        aRows.splice(iExistingIndex, 1, oReport);
      } else {
        aRows.unshift(oReport);
      }

      this._applyAnalysisRows(aRows, true, true);
    },

    _getSelectedReports: function () {
      var oTable = this.byId("analysisTable");

      if (!oTable) {
        return [];
      }

      return oTable.getSelectedItems().map(function (oItem) {
        var oContext = oItem.getBindingContext("view");
        return oContext && oContext.getObject();
      }).filter(function (oReport) {
        return oReport && oReport.ReportID;
      });
    },

    _deleteSelectedReports: function (aSelectedReports) {
      var aReportIds = aSelectedReports.map(function (oReport) {
        return oReport.ReportID;
      });

      this._setBusy(true);
      Promise.all(aReportIds.map(function (sReportId) {
        return this._oODataService.deleteSavedReport(sReportId);
      }.bind(this))).then(function () {
        this._removeAnalysisRowsByReportId(aReportIds);
        MessageToast.show("Selected report(s) deleted.");
      }.bind(this)).catch(function (oError) {
        console.error("Error deleting saved reports:", oError);
        MessageToast.show(oError.message || "Could not delete selected reports.");
      }).finally(function () {
        this._setBusy(false);
      }.bind(this));
    },

    _removeAnalysisRowsByReportId: function (aReportIds) {
      var mReportIds = {};
      var aRows = this._oViewModel.getProperty("/analysisRows") || [];

      aReportIds.forEach(function (sReportId) {
        mReportIds[sReportId] = true;
      });

      this._applyAnalysisRows(aRows.filter(function (oRow) {
        return !mReportIds[oRow.ReportID];
      }), false, true);
    },

    _clearReportSelection: function () {
      var oTable = this.byId("analysisTable");

      if (oTable) {
        oTable.removeSelections(true);
      }

      this._oViewModel.setProperty("/selectedReportCount", 0);
    },

    _setSelectedProgram: function (sProgramName) {
      var sValue = sProgramName || "";

      this._oViewModel.setProperty("/selectedProgram", sValue);

      console.log("Selected ProgramName:", sValue);
    },

    _setBusy: function (bBusy) {
      this._oViewModel.setProperty("/busy", bBusy);
    }
  });
});
