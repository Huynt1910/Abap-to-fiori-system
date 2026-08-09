sap.ui.define([
  "sap/ui/core/Fragment",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "abap/to/fiori/system/controller/BaseController",
  "abap/to/fiori/system/model/models",
  "abap/to/fiori/system/model/mailConstants",
  "abap/to/fiori/system/model/mailFormatter"
], function (Fragment, Filter, FilterOperator, MessageBox, MessageToast, BaseController, models, MailConstants, mailFormatter) {
  "use strict";

  return BaseController.extend("abap.to.fiori.system.controller.MailJobs", {
    mailFormatter: mailFormatter,

    onInit: function () {
      this._oViewModel = models.createMailUiModel();
      this.getView().setModel(this._oViewModel, "mailUi");
      this.getRouter().getRoute("mailJobs").attachPatternMatched(this._onRouteMatched, this);
    },

    onBackToDashboard: function () {
      this.getRouter().navTo("dashboard");
    },

    onSearch: function () {
      this._applyFilters();
    },

    onClearFilters: function () {
      this._clearFilters();
    },

    onOpenMailTableSettings: function () {
      this._mMailColumnSnapshot = Object.assign({}, this._oViewModel.getProperty("/columns") || {});
      this._prepareMailTableSettings();
      this._openMailTableSettingsDialog();
    },

    onSearchMailTableSettings: function (oEvent) {
      this._filterTableSettingsList("mailTableSettingsList", oEvent.getParameter("newValue"));
    },

    onMailTableSettingSelectionChange: function () {
      setTimeout(this._updateMailTableSettingsCount.bind(this), 0);
    },

    onResetMailTableSettings: function () {
      this._getMailColumnSettings().forEach(function (oColumn) {
        this._oViewModel.setProperty("/columns/" + oColumn.key, oColumn.defaultVisible);
      }.bind(this));
      this._prepareMailTableSettings();
    },

    onConfirmMailTableSettings: function () {
      this._updateMailTableSettingsCount();
      this._mMailColumnSnapshot = null;
      this.byId("mailTableSettingsDialog").close();
    },

    onCancelMailTableSettings: function () {
      if (this._mMailColumnSnapshot) {
        this._oViewModel.setProperty("/columns", this._mMailColumnSnapshot);
      }
      this._mMailColumnSnapshot = null;
      this.byId("mailTableSettingsDialog").close();
    },

    onRefresh: function () {
      this._refreshMailJobs();
    },

    onMailJobsUpdateFinished: function (oEvent) {
      var aContexts = (oEvent.getSource().getItems() || []).map(function (oItem) {
        return oItem.getBindingContext("mail");
      }).filter(Boolean);

      this._updateRecipientCounts(aContexts);
    },

    formatRecipientCountForJob: function (sJobId) {
      return mailFormatter.formatRecipientCount(this._getRecipientCount(sJobId));
    },

    canSendNowForJob: function (sJobId, sBusyJobId) {
      return mailFormatter.canSendNow(sJobId, sBusyJobId);
    },

    onEditMailJob: function (oEvent) {
      var oContext = this._getMailContext(oEvent);

      if (!oContext) {
        return;
      }

      this._oViewModel.setProperty("/listBusy", true);

      Promise.resolve(oContext.requestObject ? oContext.requestObject() : oContext.getObject())
        .then(function (oJob) {
          if (!oJob) {
            return;
          }

          return this.getMailService().loadRecipients(oJob.JobId).then(function (aRecipients) {
            this._resetWizard("edit", oJob);
            this._oViewModel.setProperty("/wizard/recipients", aRecipients || []);
            this._oWizardContext = oContext;
            this._openWizard();
          }.bind(this));
        }.bind(this))
        .catch(this._showMailError.bind(this))
        .finally(function () {
          this._oViewModel.setProperty("/listBusy", false);
        }.bind(this));
    },

    onCancelMailJobWizard: function () {
      this._oViewModel.setProperty("/wizard/busy", false);
      this._oViewModel.setProperty("/wizard/errorMessage", "");
      this.byId("mailJobWizardDialog").close();
    },

    onAddDraftRecipient: function () {
      var oRecipient = Object.assign({}, this._oViewModel.getProperty("/wizard/newRecipient"));
      var aRecipients = this._oViewModel.getProperty("/wizard/recipients").slice();

      this._oViewModel.setProperty("/wizard/errorMessage", "");
      oRecipient.SapUser = String(oRecipient.SapUser || "").trim();
      oRecipient.RecipientType = oRecipient.RecipientType || MailConstants.recipientType.to;

      if (!oRecipient.SapUser) {
        MessageToast.show(this.getText("validationSapUserRequired"));
        return;
      }

      aRecipients.push(oRecipient);
      this._oViewModel.setProperty("/wizard/recipients", aRecipients);
      if (aRecipients.length === 1) {
        this._oViewModel.setProperty("/wizard/activateAfterCreate", true);
      }
      this._oViewModel.setProperty("/wizard/newRecipient", {
        RecipientType: MailConstants.recipientType.to,
        SapUser: ""
      });
    },

    onRemoveDraftRecipient: function (oEvent) {
      var oContext = oEvent.getSource().getBindingContext("mailUi");
      var sPath = oContext && oContext.getPath();
      var iIndex = sPath ? Number(sPath.split("/").pop()) : -1;
      var aRecipients = this._oViewModel.getProperty("/wizard/recipients").slice();

      if (iIndex >= 0) {
        aRecipients.splice(iIndex, 1);
        this._oViewModel.setProperty("/wizard/recipients", aRecipients);
        if (!aRecipients.length) {
          this._oViewModel.setProperty("/wizard/activateAfterCreate", false);
        }
      }
    },

    onSaveMailJob: function () {
      var oWizard = this._oViewModel.getProperty("/wizard");
      var oJob = this._normalizeJob(oWizard.job);
      var aErrors = this._validateJob(oJob);

      this._oViewModel.setProperty("/wizard/errorMessage", "");

      if (aErrors.length) {
        this._oViewModel.setProperty("/wizard/errorMessage", aErrors.join("\n"));
        MessageBox.error(aErrors.join("\n"));
        return;
      }

      this._oViewModel.setProperty("/wizard/busy", true);

      this._withRequestTimeout(this.getMailService().updateMailJob(this._oWizardContext, oJob))
        .then(function () {
          MessageToast.show(this.getText("mailJobSaved"));
          this.byId("mailJobWizardDialog").close();
          this.onRefresh();
        }.bind(this))
        .catch(this._showWizardMailError.bind(this))
        .finally(function () {
          this._oViewModel.setProperty("/wizard/busy", false);
        }.bind(this));
    },

    onCloseWizardError: function () {
      this._oViewModel.setProperty("/wizard/errorMessage", "");
    },

    onAddRecipient: function (oEvent) {
      var oContext = this._getMailContext(oEvent);
      var oJob = oContext && oContext.getObject();

      if (!oJob || !oJob.JobId) {
        return;
      }

      this._oRecipientJobContext = oContext;
      this._oViewModel.setProperty("/recipient", {
        busy: false,
        mode: "create",
        jobId: oJob.JobId,
        data: {
          RecipientType: MailConstants.recipientType.to,
          SapUser: ""
        }
      });
      this._openRecipientDialog();
    },

    onCancelRecipientDialog: function () {
      if (this._oViewModel.getProperty("/recipient/busy")) {
        return;
      }
      this.byId("recipientDialog").close();
    },

    onSaveRecipient: function () {
      var oRecipientState = this._oViewModel.getProperty("/recipient");
      var oRecipient = Object.assign({}, oRecipientState.data || {});

      oRecipient.SapUser = String(oRecipient.SapUser || "").trim();
      oRecipient.RecipientType = oRecipient.RecipientType || MailConstants.recipientType.to;

      if (!oRecipient.SapUser) {
        MessageToast.show(this.getText("validationSapUserRequired"));
        return;
      }

      this._oViewModel.setProperty("/recipient/busy", true);
      this.getMailService().addRecipient(oRecipientState.jobId, oRecipient)
        .then(function () {
          return this._activateRecipientJobIfNeeded();
        }.bind(this))
        .then(function () {
          MessageToast.show(this.getText("recipientSaved"));
          this.byId("recipientDialog").close();
          this._refreshRecipientJob();
        }.bind(this))
        .catch(this._showMailError.bind(this))
        .finally(function () {
          this._oViewModel.setProperty("/recipient/busy", false);
        }.bind(this));
    },

    onViewDetails: function (oEvent) {
      var oContext = this._getMailContext(oEvent);
      var sJobId = oContext && oContext.getProperty("JobId");

      if (sJobId) {
        this.getRouter().navTo("mailJobDetail", {
          jobId: encodeURIComponent(sJobId)
        });
      }
    },

    onDeleteMailJob: function (oEvent) {
      var oContext = this._getMailContext(oEvent);

      if (!oContext) {
        return;
      }

      MessageBox.confirm(this.getText("deleteMailJobConfirm"), {
        onClose: function (sAction) {
          if (sAction !== MessageBox.Action.OK) {
            return;
          }

          this.getMailService().deleteMailJob(oContext)
            .then(function () {
              MessageToast.show(this.getText("mailJobDeleted"));
            }.bind(this))
            .catch(this._showMailError.bind(this));
        }.bind(this)
      });
    },

    onSendNow: function (oEvent) {
      var oContext = this._getMailContext(oEvent);
      var oJob = oContext && oContext.getObject();
      var sJobId = oJob && oJob.JobId;

      if (!oContext || !sJobId || this._oViewModel.getProperty("/sendBusyJobId") === sJobId) {
        return;
      }

      MessageBox.confirm(this.getText("sendNowConfirm"), {
        onClose: function (sAction) {
          if (sAction !== MessageBox.Action.OK) {
            return;
          }
          this._executeSendNow(oContext, sJobId);
        }.bind(this)
      });
    },

    _onRouteMatched: function () {
      setTimeout(function () {
        var oComponent = this.getOwnerComponent();
        var bPendingRefresh = oComponent.consumePendingMailJobsRefresh
          ? oComponent.consumePendingMailJobsRefresh()
          : false;
        var sCreatedJobId = this.getOwnerComponent().consumePendingCreatedMailJobId
          ? this.getOwnerComponent().consumePendingCreatedMailJobId()
          : "";
        if (bPendingRefresh || sCreatedJobId) {
          this._clearFilters();
          this._refreshMailJobs(sCreatedJobId);
        }
      }.bind(this), 0);
    },

    _executeSendNow: function (oContext, sJobId) {
      this._oViewModel.setProperty("/sendBusyJobId", sJobId);
      this.getMailService().updateContext(oContext, {
        Status: MailConstants.status.active
      }).then(function () {
        return this.getMailService().sendNow(oContext);
      }.bind(this))
        .then(function (oResult) {
          var aMessages = oResult && oResult.SAP__Messages || [];
          var bWarning = aMessages.some(function (oMessage) {
            return String(oMessage.type || oMessage.severity || "").toUpperCase() === "WARNING";
          });
          MessageToast.show(this.getText(bWarning ? "sendNowAcceptedWithWarning" : "sendNowAccepted"));
          this.onRefresh();
        }.bind(this))
        .catch(this._showMailError.bind(this))
        .finally(function () {
          this._oViewModel.setProperty("/sendBusyJobId", null);
        }.bind(this));
    },

    _applyFilters: function () {
      var oBinding = this.byId("mailJobsTable").getBinding("items");
      if (oBinding) {
        oBinding.filter(this._buildFilters());
      }
    },

    _buildFilters: function () {
      var oFilters = this._oViewModel.getProperty("/filters");
      var aFilters = [];

      if (oFilters.search) {
        aFilters.push(new Filter({
          filters: [
            new Filter(MailConstants.field.jobName, FilterOperator.Contains, oFilters.search),
            new Filter(MailConstants.field.reportType, FilterOperator.Contains, oFilters.search)
          ],
          and: false
        }));
      }

      ["frequency", "fileFormat"].forEach(function (sKey) {
        var sValue = String(oFilters[sKey] || "").trim();
        if (sValue) {
          aFilters.push(new Filter(MailConstants.field[sKey], FilterOperator.EQ, sValue));
        }
      });

      return aFilters;
    },

    _getRecipientCount: function (sJobId) {
      var mCounts = this._oViewModel.getProperty("/recipientCounts") || {};
      return mCounts[sJobId] || 0;
    },

    _clearFilters: function () {
      this._oViewModel.setProperty("/filters", {
        search: "",
        frequency: "",
        fileFormat: ""
      });
      this._applyFilters();
    },

    _refreshMailJobs: function (sExpectedJobId, iAttempt) {
      var oTable = this.byId("mailJobsTable");
      var oBinding = oTable && oTable.getBinding("items");
      var pReload = Promise.resolve();
      var iCurrentAttempt = iAttempt || 0;

      if (!oBinding) {
        return pReload;
      }

      this._oViewModel.setProperty("/listBusy", true);

      try {
        if (typeof oBinding.refresh === "function") {
          oBinding.refresh();
        }
        if (typeof oBinding.requestContexts === "function") {
          pReload = oBinding.requestContexts(0, 20);
        }
      } catch (oError) {
        pReload = Promise.reject(oError);
      }

      return pReload
        .then(function (aContexts) {
          this._updateRecipientCounts(aContexts);
          if (sExpectedJobId && !this._hasJobContext(aContexts, sExpectedJobId) && iCurrentAttempt < 6) {
            return new Promise(function (resolve) {
              setTimeout(resolve, 500);
            }).then(function () {
              return this._refreshMailJobs(sExpectedJobId, iCurrentAttempt + 1);
            }.bind(this));
          }
          return aContexts;
        }.bind(this))
        .catch(this._showMailError.bind(this))
        .finally(function () {
          if (!sExpectedJobId || iCurrentAttempt === 0) {
            this._oViewModel.setProperty("/listBusy", false);
          }
        }.bind(this));
    },

    _updateRecipientCounts: function (aContexts) {
      var aJobs = (aContexts || []).map(function (oContext) {
        return oContext && oContext.getObject && oContext.getObject();
      }).filter(Boolean);
      var mCounts = Object.assign({}, this._oViewModel.getProperty("/recipientCounts") || {});
      var aRequests = aJobs.map(function (oJob) {
        if (!oJob.JobId) {
          return Promise.resolve();
        }
        return this.getMailService().loadRecipients(oJob.JobId).then(function (aRecipients) {
          mCounts[oJob.JobId] = aRecipients.length;
        });
      }.bind(this));

      return Promise.all(aRequests).then(function () {
        this._oViewModel.setProperty("/recipientCounts", mCounts);
      }.bind(this));
    },

    _hasJobContext: function (aContexts, sJobId) {
      return (aContexts || []).some(function (oContext) {
        var oObject = oContext && oContext.getObject && oContext.getObject();
        return oObject && oObject.JobId === sJobId;
      });
    },

    _resetWizard: function (sMode, oJob) {
      var sProgramName = oJob && oJob.ReportType || "";
      this._oViewModel.setProperty("/wizard", {
        busy: false,
        mode: sMode || "create",
        errorMessage: "",
        job: Object.assign({
          AnalysisId: "",
          JobName: "",
          ReportType: "",
          FileFormat: MailConstants.fileFormat.excel,
          Frequency: MailConstants.frequency.onDemand,
          StartDate: MailConstants.scheduleDefaults.startDate,
          StartTime: MailConstants.scheduleDefaults.startTime,
          DayOfWeek: MailConstants.scheduleDefaults.dayOfWeek,
          DayOfMonth: MailConstants.scheduleDefaults.dayOfMonth,
          MailSubject: sProgramName ? "Migration report " + sProgramName : "",
          MailBody: "",
          Status: MailConstants.status.inactive
        }, oJob || {}),
        recipients: [],
        newRecipient: {
          RecipientType: MailConstants.recipientType.to,
          SapUser: ""
        },
        activateAfterCreate: false
      });
      this._oWizardContext = null;
    },

    _openWizard: function () {
      if (!this._pWizardDialog) {
        this._pWizardDialog = Fragment.load({
          id: this.getView().getId(),
          name: "abap.to.fiori.system.view.fragments.MailJobWizard",
          controller: this
        }).then(function (oDialog) {
          this.getView().addDependent(oDialog);
          return oDialog;
        }.bind(this));
      }

      this._pWizardDialog.then(function (oDialog) {
        var oWizard = this.byId("mailJobWizard");
        if (oWizard && oWizard.discardProgress) {
          oWizard.discardProgress(this.byId("mailGeneralStep"));
        }
        oDialog.open();
      }.bind(this));
    },

    _openRecipientDialog: function () {
      if (!this._pRecipientDialog) {
        this._pRecipientDialog = Fragment.load({
          id: this.getView().getId(),
          name: "abap.to.fiori.system.view.fragments.RecipientDialog",
          controller: this
        }).then(function (oDialog) {
          this.getView().addDependent(oDialog);
          return oDialog;
        }.bind(this));
      }

      this._pRecipientDialog.then(function (oDialog) {
        oDialog.open();
      });
    },

    _getMailColumnSettings: function () {
      return [
        { key: "jobName", label: this.getText("mailJobName"), defaultVisible: true },
        { key: "reportType", label: this.getText("reportType"), defaultVisible: true },
        { key: "fileFormat", label: this.getText("exportFileFormat"), defaultVisible: true },
        { key: "frequency", label: this.getText("frequency"), defaultVisible: true },
        { key: "nextRunAt", label: this.getText("nextRunAt"), defaultVisible: true },
        { key: "recipientCount", label: this.getText("recipientCount"), defaultVisible: true },
        { key: "createdBy", label: this.getText("createdBy"), defaultVisible: true },
        { key: "createdAt", label: this.getText("createdAt"), defaultVisible: true },
        { key: "actions", label: this.getText("actions"), defaultVisible: true }
      ];
    },

    _prepareMailTableSettings: function () {
      var mColumns = this._oViewModel.getProperty("/columns") || {};
      var aItems = this._getMailColumnSettings().map(function (oColumn) {
        return Object.assign({}, oColumn, {
          visible: mColumns[oColumn.key] !== false
        });
      });

      this._oViewModel.setProperty("/tableSettings", {
        items: aItems,
        selectedCount: aItems.filter(function (oColumn) {
          return oColumn.visible;
        }).length,
        totalCount: aItems.length
      });
    },

    _updateMailTableSettingsCount: function () {
      var aItems = this._oViewModel.getProperty("/tableSettings/items") || [];

      aItems.forEach(function (oColumn) {
        this._oViewModel.setProperty("/columns/" + oColumn.key, oColumn.visible !== false);
      }.bind(this));
      this._oViewModel.setProperty("/tableSettings/selectedCount", aItems.filter(function (oColumn) {
        return oColumn.visible;
      }).length);
    },

    _filterTableSettingsList: function (sListId, sSearch) {
      var oList = this.byId(sListId);
      var oBinding = oList && oList.getBinding("items");
      var sValue = String(sSearch || "").trim();

      if (oBinding) {
        oBinding.filter(sValue ? [new Filter("label", FilterOperator.Contains, sValue)] : []);
      }
    },

    _openMailTableSettingsDialog: function () {
      if (!this._pMailTableSettingsDialog) {
        this._pMailTableSettingsDialog = Fragment.load({
          id: this.getView().getId(),
          name: "abap.to.fiori.system.view.fragments.MailTableSettings",
          controller: this
        }).then(function (oDialog) {
          this.getView().addDependent(oDialog);
          return oDialog;
        }.bind(this));
      }

      this._pMailTableSettingsDialog.then(function (oDialog) {
        this._filterTableSettingsList("mailTableSettingsList", "");
        oDialog.open();
      }.bind(this));
    },

    _refreshRecipientJob: function () {
      if (this._oRecipientJobContext && this._oRecipientJobContext.refresh) {
        this._oRecipientJobContext.refresh();
      }
      this._refreshMailJobs();
    },

    _activateRecipientJobIfNeeded: function () {
      var oJob = this._oRecipientJobContext && this._oRecipientJobContext.getObject && this._oRecipientJobContext.getObject();

      if (this._oRecipientJobContext && oJob && oJob.Status !== MailConstants.status.active) {
        return this.getMailService().updateContext(this._oRecipientJobContext, {
          Status: MailConstants.status.active
        });
      }

      return Promise.resolve();
    },

    _validateJob: function (oJob) {
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

      aErrors = aErrors.concat(this.getMailService().validateSchedule(oJob, false));

      return aErrors;
    },

    _normalizeJob: function (oJob) {
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

    _getMailContext: function (oEvent) {
      return oEvent.getSource().getBindingContext("mail");
    },

    _clearBusyStates: function () {
      this._oViewModel.setProperty("/busy", false);
      this._oViewModel.setProperty("/listBusy", false);
      this._oViewModel.setProperty("/wizard/busy", false);
      this._oViewModel.setProperty("/recipient/busy", false);
      this._oViewModel.setProperty("/sendBusyJobId", null);
    },

    _showMailError: function (oError) {
      var sMessage = this.getMailService().toFriendlyError(oError).message;
      this._clearBusyStates();
      if (sMessage) {
        this._showDedupedError(sMessage);
      }
    },

    _showWizardMailError: function (oError) {
      var sMessage = this.getMailService().toFriendlyError(oError).message;
      this._clearBusyStates();
      if (!sMessage) {
        return;
      }
      this._oViewModel.setProperty("/wizard/errorMessage", sMessage);
      this._showDedupedError(sMessage);
    },

    _withRequestTimeout: function (pRequest) {
      return Promise.race([
        pRequest,
        new Promise(function (resolve, reject) {
          setTimeout(function () {
            reject(new Error(this.getText("mailRequestTimeout")));
          }.bind(this), 30000);
        }.bind(this))
      ]);
    },

    _showDedupedError: function (sMessage) {
      var iNow = Date.now();

      if (this._sLastMailErrorMessage === sMessage && iNow - (this._iLastMailErrorAt || 0) < 800) {
        return;
      }

      this._sLastMailErrorMessage = sMessage;
      this._iLastMailErrorAt = iNow;
      MessageBox.error(sMessage);
    }
  });
});
