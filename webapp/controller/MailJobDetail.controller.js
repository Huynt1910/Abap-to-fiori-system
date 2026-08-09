sap.ui.define([
  "sap/ui/core/Fragment",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "abap/to/fiori/system/controller/BaseController",
  "abap/to/fiori/system/model/models",
  "abap/to/fiori/system/model/mailConstants",
  "abap/to/fiori/system/model/mailFormatter"
], function (Fragment, MessageBox, MessageToast, BaseController, models, MailConstants, mailFormatter) {
  "use strict";

  return BaseController.extend("abap.to.fiori.system.controller.MailJobDetail", {
    mailFormatter: mailFormatter,

    onInit: function () {
      this._oViewModel = models.createMailUiModel();
      this.getView().setModel(this._oViewModel, "mailUi");
      this.getRouter().getRoute("mailJobDetail").attachPatternMatched(this._onRouteMatched, this);
    },

    onBackToMailJobs: function () {
      this.getRouter().navTo("mailJobs");
    },

    onRefresh: function () {
      var oBindingContext = this.getView().getBindingContext("mail");

      if (oBindingContext && oBindingContext.refresh) {
        oBindingContext.refresh();
      }
      this._refreshRecipients();
      this._loadLogs();
    },

    onAddRecipient: function () {
      this._oRecipientContext = null;
      this._oViewModel.setProperty("/recipient", {
        busy: false,
        mode: "create",
        jobId: this._oViewModel.getProperty("/selectedJobId"),
        data: {
          RecipientType: MailConstants.recipientType.to,
          SapUser: ""
        }
      });
      this._openRecipientDialog();
    },

    onEditRecipient: function (oEvent) {
      var oContext = oEvent.getSource().getBindingContext("mail");
      var oRecipient = oContext && oContext.getObject();

      if (!oRecipient) {
        return;
      }

      this._oRecipientContext = oContext;
      this._oViewModel.setProperty("/recipient", {
        busy: false,
        mode: "edit",
        jobId: oRecipient.JobId,
        data: Object.assign({}, oRecipient)
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

      if (oRecipientState.mode === "edit") {
        this.getMailService().updateRecipient(this._oRecipientContext, oRecipient)
          .then(this._afterRecipientSaved.bind(this))
          .catch(this._handlePossible412.bind(this, this._oRecipientContext))
          .finally(function () {
            this._oViewModel.setProperty("/recipient/busy", false);
          }.bind(this));
        return;
      }

      this.getMailService().addRecipient(oRecipientState.jobId, oRecipient)
        .then(this._activateCurrentJobIfNeeded.bind(this))
        .then(this._afterRecipientSaved.bind(this))
        .catch(this._showMailError.bind(this))
        .finally(function () {
          this._oViewModel.setProperty("/recipient/busy", false);
        }.bind(this));
    },

    onDeleteRecipient: function (oEvent) {
      var oContext = oEvent.getSource().getBindingContext("mail");

      if (!oContext) {
        return;
      }

      MessageBox.confirm(this.getText("deleteRecipientConfirm"), {
        onClose: function (sAction) {
          if (sAction !== MessageBox.Action.OK) {
            return;
          }

          this.getMailService().deleteRecipient(oContext)
            .then(function () {
              MessageToast.show(this.getText("recipientDeleted"));
              this._refreshRecipients();
            }.bind(this))
            .catch(this._showMailError.bind(this));
        }.bind(this)
      });
    },

    onSendNow: function () {
      var oContext = this.getView().getBindingContext("mail");
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

    _onRouteMatched: function (oEvent) {
      var sJobId = decodeURIComponent((oEvent.getParameter("arguments") || {}).jobId || "");

      this._oViewModel.setData(models.createMailUiModel().getData());
      this._oViewModel.setProperty("/selectedJobId", sJobId);
      this.getView().bindElement({
        path: "mail>" + this._buildMailJobPath(sJobId),
        events: {
          dataRequested: function () {
            this._oViewModel.setProperty("/busy", true);
          }.bind(this),
          dataReceived: function (oEventData) {
            this._oViewModel.setProperty("/busy", false);
            if (oEventData.getParameter("error")) {
              this._showMailError(oEventData.getParameter("error"));
            }
          }.bind(this)
        }
      });
      setTimeout(function () {
        this._refreshRecipients();
      }.bind(this), 0);
      this._loadLogs();
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
          this._loadLogsAfterSend(sJobId);
        }.bind(this))
        .catch(this._showMailError.bind(this))
        .finally(function () {
          this._oViewModel.setProperty("/sendBusyJobId", null);
        }.bind(this));
    },

    _loadLogs: function () {
      var sJobId = this._oViewModel.getProperty("/selectedJobId");

      if (!sJobId) {
        return Promise.resolve();
      }

      return this.getMailService().loadExecutionLogs(sJobId)
        .then(function (aLogs) {
          this._oViewModel.setProperty("/logs", aLogs);
        }.bind(this))
        .catch(this._showMailError.bind(this));
    },

    _loadLogsAfterSend: function (sJobId, iAttempt) {
      var iCurrentAttempt = iAttempt || 0;

      return this._loadLogs().then(function () {
        var aLogs = this._oViewModel.getProperty("/logs") || [];
        var bHasRecentManualLog = aLogs.some(function (oLog) {
          return oLog && oLog.JobId === sJobId && oLog.TriggerType === MailConstants.triggerType.manual;
        });

        if (!bHasRecentManualLog && iCurrentAttempt < 4) {
          return new Promise(function (resolve) {
            setTimeout(resolve, 750);
          }).then(function () {
            return this._loadLogsAfterSend(sJobId, iCurrentAttempt + 1);
          }.bind(this));
        }

        return aLogs;
      }.bind(this));
    },

    _afterRecipientSaved: function () {
      MessageToast.show(this.getText("recipientSaved"));
      this.byId("recipientDialog").close();
      this._refreshRecipients();
    },

    _activateCurrentJobIfNeeded: function () {
      var oContext = this.getView().getBindingContext("mail");
      var oJob = oContext && oContext.getObject();

      if (oContext && oJob && oJob.Status !== MailConstants.status.active) {
        return this.getMailService().updateContext(oContext, {
          Status: MailConstants.status.active
        });
      }

      return Promise.resolve();
    },

    _refreshRecipients: function () {
      var oBinding = this.byId("detailRecipientsTable").getBinding("items");
      var oContext = this.getView().getBindingContext("mail");

      if (oContext && oContext.refresh) {
        oContext.refresh();
      }

      if (oBinding && typeof oBinding.requestContexts === "function") {
        return oBinding.requestContexts(0, 100).then(function (aContexts) {
          this._oViewModel.setProperty("/recipientCount", aContexts.length);
          return aContexts;
        }.bind(this)).catch(this._showMailError.bind(this));
      }

      return Promise.resolve([]);
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

    _handlePossible412: function (oContext, oError) {
      if (oError && Number(oError.status || oError.statusCode) === 412 && oContext && oContext.refresh) {
        oContext.refresh();
      }
      this._showMailError(oError);
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

    _showDedupedError: function (sMessage) {
      var iNow = Date.now();

      if (this._sLastMailErrorMessage === sMessage && iNow - (this._iLastMailErrorAt || 0) < 800) {
        return;
      }

      this._sLastMailErrorMessage = sMessage;
      this._iLastMailErrorAt = iNow;
      MessageBox.error(sMessage);
    },

    _buildMailJobPath: function (sJobId) {
      if (!sJobId) {
        return MailConstants.entitySet.mailJobs;
      }
      return MailConstants.entitySet.mailJobs + "(" + encodeURIComponent(sJobId) + ")";
    }
  });
});
