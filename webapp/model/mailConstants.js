sap.ui.define([], function () {
  "use strict";

  return Object.freeze({
    service: Object.freeze({
      root: "/sap/opu/odata4/sap/zui_mig_mail_ov4/srvd/sap/zui_mig_mail/0001/",
      namespace: "com.sap.gateway.srvd.zui_mig_mail.v0001"
    }),

    entitySet: Object.freeze({
      mailJobs: "/MailJobs",
      recipients: "/Recipients",
      executionLogs: "/ExecutionLogs"
    }),

    navigation: Object.freeze({
      recipients: "_Recipients"
    }),

    action: Object.freeze({
      sendNow: "com.sap.gateway.srvd.zui_mig_mail.v0001.sendNow(...)"
    }),

    status: Object.freeze({
      active: "A",
      inactive: "I"
    }),

    executionStatus: Object.freeze({
      running: "R",
      accepted: "S",
      failed: "F"
    }),

    triggerType: Object.freeze({
      manual: "M",
      scheduled: "S"
    }),

    recipientType: Object.freeze({
      to: "T",
      cc: "C",
      bcc: "B"
    }),

    frequency: Object.freeze({
      onDemand: "O",
      daily: "D",
      weekly: "W",
      monthly: "M"
    }),

    scheduleDefaults: Object.freeze({
      startDate: null,
      startTime: "00:00:00",
      dayOfWeek: "1",
      dayOfMonth: "01"
    }),

    fileFormat: Object.freeze({
      excel: "X",
      pdf: "P",
      csv: "C"
    }),

    field: Object.freeze({
      jobId: "JobId",
      jobName: "JobName",
      reportType: "ReportType",
      status: "Status",
      frequency: "Frequency",
      fileFormat: "FileFormat",
      mailJobs: Object.freeze([
        "JobId",
        "AnalysisId",
        "JobName",
        "ReportType",
        "FileFormat",
        "Frequency",
        "StartDate",
        "StartTime",
        "DayOfWeek",
        "DayOfMonth",
        "NextRunAt",
        "MailSubject",
        "MailBody",
        "Status",
        "CreatedBy",
        "CreatedAt",
        "LocalLastChangedAt"
      ]),
      recipients: Object.freeze([
        "JobId",
        "RecipientId",
        "RecipientType",
        "SapUser",
        "EmailAddress",
        "CreatedBy",
        "CreatedAt"
      ]),
      executionLogs: Object.freeze([
        "JobId",
        "RunId",
        "TriggerType",
        "Status",
        "StartedAt",
        "FinishedAt",
        "FileName",
        "FileFormat",
        "FileSize",
        "RecipientCount",
        "LogMessage",
        "CreatedBy",
        "CreatedAt"
      ])
    })
  });
});
