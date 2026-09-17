sap.ui.define(
  [
    "abap/to/fiori/system/util/MessagingCompat",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "abap/to/fiori/system/model/mailConstants",
    "abap/to/fiori/system/util/ODataErrorHandler",
  ],
  function (Messaging, Filter, FilterOperator, Sorter, MailConstants, ODataErrorHandler) {
    "use strict";

    function MailService(oMailModel) {
      this._oModel = oMailModel;
    }

    // The create/edit controllers use these helpers before opening the wizard.
    // Keep existing values when editing; payload validation remains separate.
    MailService.prototype.normalizeSchedule = function (oJob) {
      var oDefaults = MailConstants.scheduleDefaults;
      var oNormalized = Object.assign({
        Frequency: MailConstants.frequency.onDemand,
        StartDate: oDefaults.startDate,
        StartTime: oDefaults.startTime,
        DayOfWeek: oDefaults.dayOfWeek,
        DayOfMonth: oDefaults.dayOfMonth,
        JobTimeZone: oDefaults.jobTimeZone
      }, oJob || {});

      oNormalized.JobTimeZone = String(
        oNormalized.JobTimeZone || oDefaults.jobTimeZone
      ).trim();
      return oNormalized;
    };

    MailService.prototype.getFrequencyUiState = function (sFrequency) {
      var bScheduled = [MailConstants.frequency.daily, MailConstants.frequency.weekly,
        MailConstants.frequency.monthly].indexOf(sFrequency) !== -1;
      return {
        showStartDate: bScheduled,
        showStartTime: bScheduled,
        showDayOfWeek: sFrequency === MailConstants.frequency.weekly,
        showDayOfMonth: sFrequency === MailConstants.frequency.monthly,
        timezoneText: MailConstants.scheduleDefaults.jobTimeZone
      };
    };

    MailService.prototype.createMailJob = function (oJob) {
      var oListBinding = this._oModel.bindList(
        MailConstants.entitySet.mailJobs,
        undefined,
        [],
        [],
        { $$groupId: "$direct", $$updateGroupId: "$direct" },
      );

      return this._createEntity(oListBinding, this._buildJobPayload(oJob)).then(
        function (oCreated) {
          return {
            context: oCreated.context,
            object: oCreated.object || {},
          };
        },
      );
    };

    MailService.prototype.createMailJobWithRecipients = function (mOptions) {
      var oJob = Object.assign({}, (mOptions && mOptions.job) || {}, {
        Status: MailConstants.status.inactive,
      });
      var aRecipients = (mOptions && mOptions.recipients) || [];
      var bActivate = !!(mOptions && mOptions.activateAfterCreate);
      var oCreatedContext;
      var oCreatedObject;
      var sJobId;

      return this.createMailJob(oJob)
        .then(
          function (oCreated) {
            oCreatedContext = oCreated.context;
            oCreatedObject = oCreated.object || {};
            sJobId = oCreatedObject.JobId;
            return this.addRecipients(sJobId || oCreatedContext, aRecipients);
          }.bind(this),
        )
        .then(
          function () {
            if (bActivate && aRecipients.length > 0) {
              return this.updateContext(oCreatedContext, {
                Status: MailConstants.status.active,
              });
            }
            return null;
          }.bind(this),
        )
        .then(function () {
          return oCreatedContext.requestObject().then(function (oObject) {
            return {
              context: oCreatedContext,
              object: oObject || oCreatedObject || {},
            };
          });
        });
    };

    MailService.prototype.updateMailJob = function (oContext, oJob) {
      return this.updateContext(oContext, this._buildJobPayload(oJob, true));
    };

    MailService.prototype.updateContext = function (oContext, oPayload) {
      var aProperties = this._getChangedProperties(oContext, oPayload);

      return aProperties
        .reduce(function (pChain, sProperty) {
          return pChain.then(function () {
            return oContext.setProperty(sProperty, oPayload[sProperty]);
          });
        }, Promise.resolve())
        .then(function () {
          return oContext.requestObject();
        });
    };

    MailService.prototype.deleteMailJob = function (oContext) {
      return oContext.delete("$auto");
    };

    MailService.prototype.addRecipient = function (vJob, oRecipient) {
      var oListBinding = this._bindRecipients(vJob);

      return this._createEntity(
        oListBinding,
        this._buildRecipientPayload(oRecipient),
      ).then(function (oCreated) {
        return oCreated.object;
      });
    };

    MailService.prototype.loadRecipients = function (vJob) {
      var oListBinding = this._bindRecipients(vJob);

      return oListBinding.requestContexts(0, 100).then(function (aContexts) {
        return aContexts.map(function (oContext) {
          return oContext.getObject();
        });
      });
    };

    MailService.prototype.addRecipients = function (vJob, aRecipients) {
      return (aRecipients || []).reduce(
        function (pChain, oRecipient) {
          return pChain.then(
            function () {
              return this.addRecipient(vJob, oRecipient);
            }.bind(this),
          );
        }.bind(this),
        Promise.resolve(),
      );
    };

    MailService.prototype.updateRecipient = function (oContext, oRecipient) {
      return this.updateContext(
        oContext,
        this._buildRecipientPayload(oRecipient, true),
      );
    };

    MailService.prototype.deleteRecipient = function (oContext) {
      return oContext.delete("$auto");
    };

    MailService.prototype.sendNow = function (oMailJobContext) {
      var oAction = this._oModel.bindContext(
        MailConstants.action.sendNow,
        oMailJobContext,
      );
      return oAction.execute("$direct").then(function () {
        var oContext = oAction.getBoundContext();
        return oContext ? oContext.requestObject() : {};
      });
    };

    MailService.prototype.loadExecutionLogs = function (sJobId) {
      return this._readList(MailConstants.entitySet.executionLogs, {
        filters: [new Filter("JobId", FilterOperator.EQ, sJobId)],
        sorters: [new Sorter("StartedAt", true)],
        parameters: {
          $$groupId: "$direct",
          $$ownRequest: true,
        },
        length: 100,
      });
    };

    MailService.prototype.validateSchedule = function (oJob, bCreate) {
      var sFrequency = String((oJob && oJob.Frequency) || "").toUpperCase();
      var aErrors = [];

      if (sFrequency === MailConstants.frequency.onDemand) {
        return aErrors;
      }

      if (["D", "W", "M"].indexOf(sFrequency) === -1) {
        aErrors.push("Frequency is required.");
        return aErrors;
      }

      if (!oJob.StartDate) {
        aErrors.push("Start date is required.");
      } else if (!/^\d{4}-\d{2}-\d{2}$/.test(String(oJob.StartDate))) {
        aErrors.push("Start date must use YYYY-MM-DD format.");
      } else if (bCreate && this._isPastDate(oJob.StartDate)) {
        aErrors.push("Start date cannot be earlier than today.");
      }

      if (!oJob.StartTime) {
        aErrors.push("Start time is required.");
      } else if (
        !/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(
          String(oJob.StartTime),
        )
      ) {
        aErrors.push("Start time must use HH:mm:ss format.");
      }

      if (!String(oJob.JobTimeZone || "").trim()) {
        aErrors.push("Time zone is required.");
      }

      if (sFrequency === MailConstants.frequency.weekly) {
        if (!oJob.DayOfWeek) {
          aErrors.push("Day of week is required.");
        } else if (!/^[1-7]$/.test(String(oJob.DayOfWeek))) {
          aErrors.push("Day of week is invalid.");
        }
      }

      if (sFrequency === MailConstants.frequency.monthly) {
        if (!oJob.DayOfMonth) {
          aErrors.push("Day of month is required.");
        } else if (
          Number(oJob.DayOfMonth) < 1 ||
          Number(oJob.DayOfMonth) > 31
        ) {
          aErrors.push("Day of month must be from 1 to 31.");
        }
      }

      return aErrors;
    };

    MailService.prototype.buildSchedulePayload = function (oJob) {
      var oSchedule = this.normalizeSchedule(oJob);
      var oDefaults = MailConstants.scheduleDefaults;
      var sFrequency = String(oSchedule.Frequency || "").toUpperCase();
      var oPayload = {
        Frequency: sFrequency,
        StartTime: oSchedule.StartTime || oDefaults.startTime,
        JobTimeZone: oSchedule.JobTimeZone || oDefaults.jobTimeZone,
        DayOfWeek: oDefaults.dayOfWeek,
        DayOfMonth: String(oDefaults.dayOfMonth)
      };

      if (
        sFrequency !== MailConstants.frequency.onDemand &&
        oSchedule.StartDate
      ) {
        oPayload.StartDate = oSchedule.StartDate;
      }
      if (sFrequency === MailConstants.frequency.weekly) {
        oPayload.DayOfWeek = String(oSchedule.DayOfWeek || oDefaults.dayOfWeek);
      }
      if (sFrequency === MailConstants.frequency.monthly) {
        oPayload.DayOfMonth = this._formatDayOfMonth(oSchedule.DayOfMonth);
      }

      return oPayload;
    };

    MailService.prototype.toFriendlyError = function (oError) {
      return ODataErrorHandler.parse(oError);
    };

    MailService.prototype._createEntity = function (oListBinding, oPayload) {
      var oContext;

      if (typeof oListBinding.attachCreateCompleted !== "function") {
        oContext = oListBinding.create(oPayload);
        return oContext.created().then(
          function () {
            return this._createdResult(oContext);
          }.bind(this),
        );
      }

      return new Promise(
        function (resolve, reject) {
          var bSettled = false;
          var oListener = this;

          function cleanup() {
            if (typeof oListBinding.detachCreateCompleted === "function") {
              oListBinding.detachCreateCompleted(onCreateCompleted, oListener);
            }
          }

          function settle(fnCallback, vValue) {
            if (bSettled) {
              return;
            }
            bSettled = true;
            cleanup();
            fnCallback(vValue);
          }

          function onCreateCompleted(oEvent) {
            var oEventContext =
              oEvent.getParameter && oEvent.getParameter("context");
            var bSuccess =
              oEvent.getParameter && oEvent.getParameter("success");
            var oError =
              oEvent.getParameter &&
              (oEvent.getParameter("error") ||
                oEvent.getParameter("response") ||
                oEvent.getParameter("message"));

            if (oEventContext && oContext && oEventContext !== oContext) {
              return;
            }

            if (bSuccess === false) {
              setTimeout(
                function () {
                  settle(
                    reject,
                    oError ||
                      this._getLatestTechnicalError() ||
                      new Error("Create request failed."),
                  );
                }.bind(this),
                0,
              );
              return;
            }

            settle(resolve, this._createdResult(oContext));
          }

          oListBinding.attachCreateCompleted(onCreateCompleted, this);
          oContext = oListBinding.create(oPayload);

          oContext
            .created()
            .then(
              function () {
                settle(resolve, this._createdResult(oContext));
              }.bind(this),
            )
            .catch(function (oError) {
              settle(reject, oError);
            });
        }.bind(this),
      );
    };

    MailService.prototype._createdResult = function (oContext) {
      return oContext.requestObject().then(function (oObject) {
        return {
          context: oContext,
          object: oObject || {},
        };
      });
    };

    MailService.prototype._getLatestTechnicalError = function () {
      var oMessageModel =
        Messaging && typeof Messaging.getMessageModel === "function"
          ? Messaging.getMessageModel()
          : null;
      var aMessages =
        oMessageModel && typeof oMessageModel.getData === "function"
          ? oMessageModel.getData()
          : [];
      var oMessage;
      var sMessage;
      var sCode;

      if (!Array.isArray(aMessages) || !aMessages.length) {
        return null;
      }

      oMessage = aMessages
        .slice()
        .reverse()
        .find(
          function (oEntry) {
            return (
              oEntry &&
              (oEntry.technical === true ||
                (typeof oEntry.getTechnical === "function" && oEntry.getTechnical() === true))
            );
          }.bind(this),
        );

      if (!oMessage) {
        return null;
      }

      sMessage =
        typeof oMessage.getMessage === "function"
          ? oMessage.getMessage()
          : oMessage.message;
      sCode =
        typeof oMessage.getCode === "function"
          ? oMessage.getCode()
          : oMessage.code;

      if (!sMessage) {
        return null;
      }

      return {
        status: 400,
        responseText: JSON.stringify({
          error: {
            code: sCode || "",
            message: sMessage,
          },
        }),
      };
    };

    MailService.prototype._bindRecipients = function (vJob) {
      if (vJob && typeof vJob.getPath === "function") {
        return this._oModel.bindList(
          MailConstants.navigation.recipients,
          vJob,
          [],
          [],
          { $$groupId: "$direct", $$updateGroupId: "$direct" },
        );
      }
      return this._oModel.bindList(
        this._buildMailJobPath(vJob) +
          "/" +
          MailConstants.navigation.recipients,
        undefined,
        [],
        [],
        { $$groupId: "$direct", $$updateGroupId: "$direct" },
      );
    };

    MailService.prototype._buildJobPayload = function (oJob, bPatch) {
      var aFields = [
        "AnalysisId",
        "JobName",
        "ReportType",
        "FileFormat",
        "Frequency",
        "MailSubject",
        "MailBody",
        "Status",
      ];
      var oPayload;

      if (bPatch) {
        aFields = aFields.filter(function (sField) {
          return sField !== "AnalysisId";
        });
      }

      oPayload = this._pick(oJob, aFields, bPatch);
      return Object.assign(oPayload, this.buildSchedulePayload(oJob));
    };

    MailService.prototype._buildRecipientPayload = function (
      oRecipient,
      bPatch,
    ) {
      return this._pick(oRecipient, ["RecipientType", "SapUser"], bPatch);
    };

    MailService.prototype._pick = function (oSource, aFields, bPatch) {
      var oPayload = {};
      var oData = oSource || {};

      aFields.forEach(function (sField) {
        if (Object.prototype.hasOwnProperty.call(oData, sField)) {
          var vValue = oData[sField];
          if (vValue !== null && vValue !== undefined) {
            oPayload[sField] = vValue;
          }
        }
      });

      return oPayload;
    };

    MailService.prototype._getChangedProperties = function (
      oContext,
      oPayload,
    ) {
      var oCurrent =
        oContext && typeof oContext.getObject === "function"
          ? oContext.getObject() || {}
          : null;

      return Object.keys(oPayload || {}).filter(function (sProperty) {
        return (
          !oCurrent ||
          !Object.prototype.hasOwnProperty.call(oCurrent, sProperty) ||
          oCurrent[sProperty] !== oPayload[sProperty]
        );
      });
    };

    MailService.prototype._formatDayOfMonth = function (vValue) {
      return String(vValue || MailConstants.scheduleDefaults.dayOfMonth);
    };

    MailService.prototype._readList = function (sPath, mOptions) {
      var mReadOptions = mOptions || {};
      var oListBinding = this._oModel.bindList(
        sPath,
        undefined,
        mReadOptions.sorters || [],
        mReadOptions.filters || [],
        Object.assign({ $$groupId: "$direct" }, mReadOptions.parameters || {}),
      );

      return oListBinding
        .requestContexts(0, mReadOptions.length || 100)
        .then(function (aContexts) {
          return aContexts.map(function (oContext) {
            return oContext.getObject();
          });
        });
    };

    MailService.prototype._buildMailJobPath = function (sJobId) {
      var sId = String(sJobId || "").trim();
      if (!sId) {
        throw new Error("JobId is required.");
      }
      return (
        MailConstants.entitySet.mailJobs + "(" + encodeURIComponent(sId) + ")"
      );
    };

    MailService.prototype._isPastDate = function (vStartDate) {
      var oDate =
        vStartDate instanceof Date ? vStartDate : new Date(vStartDate);
      var oToday = new Date();

      if (isNaN(oDate.getTime())) {
        return true;
      }

      oToday.setHours(0, 0, 0, 0);
      oDate.setHours(0, 0, 0, 0);
      return oDate.getTime() < oToday.getTime();
    };

    return MailService;
  },
);
