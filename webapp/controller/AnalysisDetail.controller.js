sap.ui.define([
  "sap/ui/core/Fragment",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "abap/to/fiori/system/controller/BaseController",
  "abap/to/fiori/system/model/models",
  "abap/to/fiori/system/model/mailConstants",
  "abap/to/fiori/system/model/mailFormatter",
  "abap/to/fiori/system/util/Constants",
  "abap/to/fiori/system/util/formatter"
], function (Fragment, MessageBox, MessageToast, BaseController, models, MailConstants, mailFormatter, Constants, formatter) {
  "use strict";

  return BaseController.extend("abap.to.fiori.system.controller.AnalysisDetail", {
    formatter: formatter,
    mailFormatter: mailFormatter,

    onInit: function () {
      this._oViewModel = models.createAnalysisDetailModel();
      this.getView().setModel(this._oViewModel, "detail");
      this._oMailViewModel = models.createMailUiModel();
      this.getView().setModel(this._oMailViewModel, "mailUi");
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

    onCreateMailJobForAnalysis: function () {
      var sAnalysisId = this._oViewModel.getProperty("/analysisId");
      if (sAnalysisId) {
        this._resetMailWizard();
        this._prefillMailWizardFromAnalysis();
        this._openMailWizard();
      }
    },

    onCancelMailJobWizard: function () {
      this._oMailViewModel.setProperty("/wizard/busy", false);
      this._oMailViewModel.setProperty("/wizard/errorMessage", "");
      this.byId("mailJobWizardDialog").close();
    },

    onAddDraftRecipient: function () {
      var oRecipient = Object.assign({}, this._oMailViewModel.getProperty("/wizard/newRecipient"));
      var aRecipients = this._oMailViewModel.getProperty("/wizard/recipients").slice();

      this._oMailViewModel.setProperty("/wizard/errorMessage", "");
      oRecipient.SapUser = String(oRecipient.SapUser || "").trim();
      oRecipient.RecipientType = oRecipient.RecipientType || MailConstants.recipientType.to;

      if (!oRecipient.SapUser) {
        MessageToast.show(this.getText("validationSapUserRequired"));
        return;
      }

      aRecipients.push(oRecipient);
      this._oMailViewModel.setProperty("/wizard/recipients", aRecipients);
      if (aRecipients.length === 1) {
        this._oMailViewModel.setProperty("/wizard/activateAfterCreate", true);
      }
      this._oMailViewModel.setProperty("/wizard/newRecipient", {
        RecipientType: MailConstants.recipientType.to,
        SapUser: ""
      });
    },

    onRemoveDraftRecipient: function (oEvent) {
      var oContext = oEvent.getSource().getBindingContext("mailUi");
      var sPath = oContext && oContext.getPath();
      var iIndex = sPath ? Number(sPath.split("/").pop()) : -1;
      var aRecipients = this._oMailViewModel.getProperty("/wizard/recipients").slice();

      if (iIndex >= 0) {
        aRecipients.splice(iIndex, 1);
        this._oMailViewModel.setProperty("/wizard/recipients", aRecipients);
        if (!aRecipients.length) {
          this._oMailViewModel.setProperty("/wizard/activateAfterCreate", false);
        }
      }
    },

    onSaveMailJob: function () {
      var oWizard = this._oMailViewModel.getProperty("/wizard");
      var oJob = this._normalizeMailJob(oWizard.job);
      var aRecipients = oWizard.recipients || [];
      var aErrors = this._validateMailJob(oJob);

      this._oMailViewModel.setProperty("/wizard/errorMessage", "");

      if (aErrors.length) {
        this._oMailViewModel.setProperty("/wizard/errorMessage", aErrors.join("\n"));
        MessageBox.error(aErrors.join("\n"));
        return;
      }

      this._oMailViewModel.setProperty("/wizard/busy", true);
      this._withMailRequestTimeout(this.getMailService().createMailJobWithRecipients({
        job: oJob,
        recipients: aRecipients,
        activateAfterCreate: oWizard.activateAfterCreate
      })).then(function (oCreated) {
        var sJobId = oCreated && oCreated.object && oCreated.object.JobId;
        if (sJobId && this.getOwnerComponent().setPendingCreatedMailJobId) {
          this.getOwnerComponent().setPendingCreatedMailJobId(sJobId);
        }
        MessageToast.show(this.getText("mailJobCreated"));
        this.byId("mailJobWizardDialog").close();
        this.getRouter().navTo("mailJobs");
      }.bind(this)).catch(this._showMailWizardError.bind(this)).finally(function () {
        this._oMailViewModel.setProperty("/wizard/busy", false);
      }.bind(this));
    },

    onCloseWizardError: function () {
      this._oMailViewModel.setProperty("/wizard/errorMessage", "");
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

    _resetMailWizard: function () {
      this._oMailViewModel.setProperty("/wizard", {
        busy: false,
        mode: "create",
        errorMessage: "",
        job: {
          AnalysisId: "",
          JobName: "",
          ReportType: "",
          FileFormat: MailConstants.fileFormat.excel,
          Frequency: MailConstants.frequency.onDemand,
          StartDate: MailConstants.scheduleDefaults.startDate,
          StartTime: MailConstants.scheduleDefaults.startTime,
          DayOfWeek: MailConstants.scheduleDefaults.dayOfWeek,
          DayOfMonth: MailConstants.scheduleDefaults.dayOfMonth,
          MailSubject: "",
          MailBody: "",
          Status: MailConstants.status.inactive
        },
        recipients: [],
        newRecipient: {
          RecipientType: MailConstants.recipientType.to,
          SapUser: ""
        },
        activateAfterCreate: false
      });
    },

    _prefillMailWizardFromAnalysis: function () {
      var sAnalysisId = this._oViewModel.getProperty("/analysisId");
      var oOverview = this._oViewModel.getProperty("/overview") || {};
      var sProgramName = oOverview.ProgramName || "";

      this._oMailViewModel.setProperty("/wizard/job/AnalysisId", sAnalysisId);
      this._oMailViewModel.setProperty("/wizard/job/ReportType", sProgramName);
      this._oMailViewModel.setProperty("/wizard/job/JobName", sProgramName ? "Mail " + sProgramName : "");
      this._oMailViewModel.setProperty("/wizard/job/MailSubject", sProgramName ? "Migration report " + sProgramName : "");
    },

    _openMailWizard: function () {
      if (!this._pMailWizardDialog) {
        this._pMailWizardDialog = Fragment.load({
          id: this.getView().getId(),
          name: "abap.to.fiori.system.view.fragments.MailJobWizard",
          controller: this
        }).then(function (oDialog) {
          this.getView().addDependent(oDialog);
          return oDialog;
        }.bind(this));
      }

      this._pMailWizardDialog.then(function (oDialog) {
        var oWizard = this.byId("mailJobWizard");
        if (oWizard && oWizard.discardProgress) {
          oWizard.discardProgress(this.byId("mailGeneralStep"));
        }
        oDialog.open();
      }.bind(this));
    },

    _validateMailJob: function (oJob) {
      var aErrors = [];

      if (!oJob.JobName) {
        aErrors.push(this.getText("validationJobNameRequired"));
      }
      if (!oJob.ReportType) {
        aErrors.push(this.getText("validationReportTypeRequired"));
      }
      if (!oJob.FileFormat) {
        aErrors.push(this.getText("validationFileFormatRequired"));
      }
      if (!oJob.MailSubject) {
        aErrors.push(this.getText("validationMailSubjectRequired"));
      }

      aErrors = aErrors.concat(this.getMailService().validateSchedule(oJob, true));

      return aErrors;
    },

    _normalizeMailJob: function (oJob) {
      var oPayload = Object.assign({}, oJob || {});

      if (oPayload.Frequency === MailConstants.frequency.onDemand) {
        oPayload.StartDate = MailConstants.scheduleDefaults.startDate;
        oPayload.StartTime = MailConstants.scheduleDefaults.startTime;
        oPayload.DayOfWeek = MailConstants.scheduleDefaults.dayOfWeek;
        oPayload.DayOfMonth = MailConstants.scheduleDefaults.dayOfMonth;
        return oPayload;
      }

      if (oPayload.Frequency !== MailConstants.frequency.weekly) {
        oPayload.DayOfWeek = "";
      }
      if (oPayload.Frequency !== MailConstants.frequency.monthly) {
        oPayload.DayOfMonth = "";
      } else if (oPayload.DayOfMonth) {
        oPayload.DayOfMonth = String(oPayload.DayOfMonth).padStart(2, "0");
      }

      return oPayload;
    },

    _showMailWizardError: function (oError) {
      var sMessage = this.getMailService().toFriendlyError(oError).message;
      this._oMailViewModel.setProperty("/wizard/busy", false);
      this._oMailViewModel.setProperty("/wizard/errorMessage", sMessage);
      MessageBox.error(sMessage);
    },

    _withMailRequestTimeout: function (pRequest) {
      return Promise.race([
        pRequest,
        new Promise(function (resolve, reject) {
          setTimeout(function () {
            reject(new Error(this.getText("mailRequestTimeout")));
          }.bind(this), 30000);
        }.bind(this))
      ]);
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
