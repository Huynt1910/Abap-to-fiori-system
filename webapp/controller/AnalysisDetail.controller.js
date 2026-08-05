sap.ui.define([
  "sap/ui/core/Fragment",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "abap/to/fiori/system/controller/BaseController",
  "abap/to/fiori/system/model/models",
  "abap/to/fiori/system/util/Constants",
  "abap/to/fiori/system/util/formatter"
], function (Fragment, MessageBox, MessageToast, BaseController, models, Constants, formatter) {
  "use strict";

  return BaseController.extend("abap.to.fiori.system.controller.AnalysisDetail", {
    formatter: formatter,

    onInit: function () {
      this._oViewModel = models.createAnalysisDetailModel();
      this.getView().setModel(this._oViewModel, "detail");
      this.getRouter().getRoute("analysisDetail").attachPatternMatched(this._onRouteMatched, this);
      this.getRouter().getRoute("detail").attachPatternMatched(this._onRouteMatched, this);
    },

    onBackToDashboard: function () {
      this.getRouter().navTo("dashboard");
    },

    onSectionNavigate: function (oEvent) {
      var oSection = oEvent.getParameter("section");
      var sSectionId = oSection && oSection.getId && oSection.getId();
      var sSectionKey = this._getSectionKeyFromId(sSectionId);

      if (sSectionKey) {
        this._oViewModel.setProperty("/selectedTab", sSectionKey);
        this._loadTabData(sSectionKey);
      }
    },

    onRefresh: function () {
      var sSelectedTab = this._oViewModel.getProperty("/selectedTab");

      this._resetLoadedState();
      this._loadHeader().then(function () {
        return this._loadTabData(sSelectedTab);
      }.bind(this));
    },

    onOpenExportDialog: function () {
      this._resetExportState();
      this._openExportDialog();
    },

    onCancelExport: function () {
      if (this._oViewModel.getProperty("/export/busy")) {
        return;
      }

      this.byId("exportReportDialog").close();
      this._oViewModel.setProperty("/export/dialogOpen", false);
    },

    onDownloadExport: function () {
      var oExport = this._oViewModel.getProperty("/export");

      if (oExport.busy) {
        return;
      }

      this._oViewModel.setProperty("/export/busy", true);
      this.getDocumentService().downloadExport({
        reportType: oExport.reportType,
        fileFormat: oExport.fileFormat,
        exportSection: oExport.exportSection
      }).then(function () {
        MessageToast.show(this.getText("exportSuccess"));
        this.byId("exportReportDialog").close();
        this._oViewModel.setProperty("/export/dialogOpen", false);
      }.bind(this)).catch(function (oError) {
        MessageBox.error(oError && oError.message || this.getText("exportError"));
      }.bind(this)).finally(function () {
        this._oViewModel.setProperty("/export/busy", false);
      }.bind(this));
    },

    onMessagePress: function (oEvent) {
      this._showRowText(oEvent, "MessageText", "messageDetailsTitle");
    },

    onDatabaseObjectPress: function (oEvent) {
      this._showRowText(oEvent, "Description", "databaseObjectDetailsTitle");
    },

    onBusinessLogicPress: function (oEvent) {
      this._showRowText(oEvent, "Description", "businessLogicDetailsTitle");
    },

    onAlvOutputPress: function (oEvent) {
      this._showRowText(oEvent, "OutputName", "alvOutputDetailsTitle");
    },

    onEvidencePress: function (oEvent) {
      this._showRowText(oEvent, "StatementText", "evidenceDetailsTitle");
    },

    onRetryRecommendations: function () {
      this._oViewModel.setProperty("/loaded/recommendations", false);
      this._loadTabData(Constants.section.recommendations);
    },

    onRecommendationPress: function (oEvent) {
      var oContext = (oEvent.getParameter("listItem") || oEvent.getSource()).getBindingContext("detail");
      var oRecommendation = oContext && oContext.getObject();

      if (oRecommendation) {
        this._oViewModel.setProperty("/selectedRecommendation", oRecommendation);
        this._openRecommendationDetailDialog();
      }
    },

    onCloseRecommendationDetail: function () {
      this.byId("recommendationDetailDialog").close();
    },

    _onRouteMatched: function (oEvent) {
      var oArguments = oEvent.getParameter("arguments");
      var sAnalysisId = decodeURIComponent(oArguments.analysisId || "");

      this._resetState(sAnalysisId);
      this._loadHeader().then(function () {
        return this._loadTabData(this._oViewModel.getProperty("/selectedTab"));
      }.bind(this));
    },

    _resetState: function (sAnalysisId) {
      this._oViewModel.setData(models.createAnalysisDetailModel().getData());
      this._oViewModel.setProperty("/analysisId", sAnalysisId);
    },

    _resetLoadedState: function () {
      Object.keys(this._oViewModel.getProperty("/loaded")).forEach(function (sKey) {
        this._oViewModel.setProperty("/loaded/" + sKey, false);
      }.bind(this));
    },

    _loadHeader: function () {
      var sAnalysisId = this._oViewModel.getProperty("/analysisId");

      this._setBusy(true);
      return this.getAnalysisService().getAnalysisById(sAnalysisId)
        .then(function (oAnalysis) {
          this._oViewModel.setProperty("/overview", oAnalysis || {});
          this._oViewModel.setProperty("/counts", {
            uiFilters: oAnalysis && oAnalysis.TotalUiFilters,
            databaseObjects: oAnalysis && oAnalysis.TotalDatabaseObjects,
            businessLogic: oAnalysis && oAnalysis.TotalBusinessLogic,
            alvOutputs: oAnalysis && oAnalysis.TotalAlvOutputs,
            alvColumns: oAnalysis && oAnalysis.TotalAlvColumns,
            recommendations: oAnalysis && oAnalysis.TotalRecommendations
          });
        }.bind(this))
        .catch(function (oError) {
          this.showError(oError, "loadOverviewError");
        }.bind(this))
        .finally(function () {
          this._setBusy(false);
        }.bind(this));
    },

    _loadTabData: function (sTabKey) {
      if (this._oViewModel.getProperty("/loaded/" + sTabKey)) {
        return Promise.resolve();
      }

      if (sTabKey === Constants.section.uiFilters) {
        return this._loadList("uiFilters", "getUiFilters", "loadUiFiltersError");
      }

      if (sTabKey === Constants.section.databaseObjects) {
        return this._loadList("databaseObjects", "getDatabaseObjects", "loadDatabaseError");
      }

      if (sTabKey === Constants.section.businessLogic) {
        return this._loadList("businessLogic", "getBusinessLogic", "loadBusinessLogicError");
      }

      if (sTabKey === Constants.section.alvOutputs) {
        return this._loadList("alvOutputs", "getAlvOutputs", "loadAlvOutputsError");
      }

      if (sTabKey === Constants.section.evidences) {
        return this._loadList("evidences", "getEvidences", "loadEvidencesError");
      }

      if (sTabKey === Constants.section.recommendations) {
        return this._loadList("recommendations", "getRecommendations", "loadRecommendationsError");
      }

      if (sTabKey === Constants.section.messages) {
        return this._loadList("messages", "getMessages", "loadMessagesError");
      }

      return Promise.resolve();
    },

    _loadList: function (sStateKey, sServiceMethod, sErrorTextKey) {
      var sAnalysisId = this._oViewModel.getProperty("/analysisId");

      this._oViewModel.setProperty("/loading/" + sStateKey, true);
      this._oViewModel.setProperty("/errors/" + sStateKey, null);

      return this.getAnalysisService()[sServiceMethod](sAnalysisId)
        .then(function (aRows) {
          this._oViewModel.setProperty("/" + sStateKey, aRows);
          this._oViewModel.setProperty("/counts/" + sStateKey, aRows.length);
          this._oViewModel.setProperty("/loaded/" + sStateKey, true);
        }.bind(this))
        .catch(function (oError) {
          this._oViewModel.setProperty(
            "/errors/" + sStateKey,
            oError && oError.message || this.getText(sErrorTextKey)
          );
        }.bind(this))
        .finally(function () {
          this._oViewModel.setProperty("/loading/" + sStateKey, false);
        }.bind(this));
    },

    _showRowText: function (oEvent, sProperty, sTitleKey) {
      var oContext = (oEvent.getParameter("listItem") || oEvent.getSource()).getBindingContext("detail");
      var oRow = oContext && oContext.getObject();
      var sText = oRow && oRow[sProperty] || this.getText("notAvailable");

      MessageBox.information(sText, {
        title: this.getText(sTitleKey)
      });
    },

    _resetExportState: function () {
      this._oViewModel.setProperty("/export", {
        busy: false,
        fileFormat: Constants.fileFormat.excel,
        exportSection: Constants.exportSection.all,
        reportType: this._oViewModel.getProperty("/overview/ProgramName") || "",
        dialogOpen: false
      });
    },

    _openExportDialog: function () {
      if (!this._pExportDialog) {
        this._pExportDialog = Fragment.load({
          id: this.getView().getId(),
          name: "abap.to.fiori.system.view.fragments.ExportReportDialog",
          controller: this
        }).then(function (oDialog) {
          this.getView().addDependent(oDialog);
          return oDialog;
        }.bind(this));
      }

      this._pExportDialog.then(function (oDialog) {
        this._oViewModel.setProperty("/export/dialogOpen", true);
        oDialog.open();
      }.bind(this));
    },

    _openRecommendationDetailDialog: function () {
      if (!this._pRecommendationDetailDialog) {
        this._pRecommendationDetailDialog = Fragment.load({
          id: this.getView().getId(),
          name: "abap.to.fiori.system.view.fragments.detail.RecommendationDetail",
          controller: this
        }).then(function (oDialog) {
          this.getView().addDependent(oDialog);
          return oDialog;
        }.bind(this));
      }

      this._pRecommendationDetailDialog.then(function (oDialog) {
        oDialog.open();
      });
    },

    _getSectionKeyFromId: function (sSectionId) {
      var mSectionIds = {};

      mSectionIds[Constants.section.uiFilters] = "uiFiltersSection";
      mSectionIds[Constants.section.databaseObjects] = "databaseObjectsSection";
      mSectionIds[Constants.section.businessLogic] = "businessLogicSection";
      mSectionIds[Constants.section.alvOutputs] = "alvOutputsSection";
      mSectionIds[Constants.section.evidences] = "evidencesSection";
      mSectionIds[Constants.section.recommendations] = "recommendationsSection";
      mSectionIds[Constants.section.messages] = "messagesSection";

      return Object.keys(mSectionIds).find(function (sKey) {
        return sSectionId && sSectionId.indexOf(mSectionIds[sKey]) !== -1;
      });
    },

    _setBusy: function (bBusy) {
      this._oViewModel.setProperty("/busy", bBusy);
    }
  });
});
