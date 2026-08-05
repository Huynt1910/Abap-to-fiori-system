sap.ui.define([], function () {
  "use strict";

  function normalize(vValue) {
    return String(vValue === null || vValue === undefined ? "" : vValue).trim();
  }

  function formatInteger(vValue) {
    var iValue = parseInt(vValue, 10);
    return isNaN(iValue) ? "-" : iValue.toLocaleString();
  }

  return {
    formatExecutionStatus: function (sStatus) {
      var sValue = normalize(sStatus).toUpperCase();
      if (sValue === "R") {
        return "Running";
      }
      if (sValue === "S") {
        return "Accepted by SAPconnect";
      }
      if (sValue === "F") {
        return "Failed";
      }
      return sValue || "-";
    },

    formatExecutionStatusState: function (sStatus) {
      var sValue = normalize(sStatus).toUpperCase();
      if (sValue === "R") {
        return "Information";
      }
      if (sValue === "S") {
        return "Success";
      }
      if (sValue === "F") {
        return "Error";
      }
      return "None";
    },

    formatExecutionStatusTooltip: function (sStatus) {
      return normalize(sStatus).toUpperCase() === "S"
        ? "The request was accepted by SAPconnect. Final SMTP delivery status is not exposed by the current API."
        : "";
    },

    formatFrequency: function (sFrequency) {
      var sValue = normalize(sFrequency).toUpperCase();
      if (sValue === "O") {
        return "On-demand";
      }
      if (sValue === "D") {
        return "Daily";
      }
      if (sValue === "W") {
        return "Weekly";
      }
      if (sValue === "M") {
        return "Monthly";
      }
      return sValue || "-";
    },

    formatFileFormat: function (sFileFormat) {
      var sValue = normalize(sFileFormat).toUpperCase();
      if (sValue === "X") {
        return "Excel";
      }
      if (sValue === "P") {
        return "PDF";
      }
      if (sValue === "C") {
        return "CSV";
      }
      return sValue || "-";
    },

    formatRecipientType: function (sType) {
      var sValue = normalize(sType).toUpperCase();
      if (sValue === "T") {
        return "To";
      }
      if (sValue === "C") {
        return "Cc";
      }
      if (sValue === "B") {
        return "Bcc";
      }
      return sValue || "-";
    },

    formatTriggerType: function (sType) {
      var sValue = normalize(sType).toUpperCase();
      if (sValue === "M") {
        return "Manual";
      }
      if (sValue === "S") {
        return "Scheduled";
      }
      return sValue || "-";
    },

    formatDateTime: function (vValue) {
      if (!vValue) {
        return "-";
      }
      var oDate = vValue instanceof Date ? vValue : new Date(vValue);
      return isNaN(oDate.getTime()) ? String(vValue) : oDate.toLocaleString();
    },

    formatDate: function (vValue) {
      return vValue || "-";
    },

    formatTime: function (vValue) {
      return vValue || "-";
    },

    formatNumber: function (vValue) {
      return formatInteger(vValue);
    },

    formatText: function (vValue) {
      var sValue = normalize(vValue);
      return sValue || "-";
    },

    hasValue: function (vValue) {
      return !!normalize(vValue);
    },

    formatRecipientCount: function (vRecipients) {
      if (Array.isArray(vRecipients)) {
        return formatInteger(vRecipients.length);
      }
      return formatInteger(vRecipients);
    },

    hasRecipients: function (vRecipients) {
      if (Array.isArray(vRecipients)) {
        return vRecipients.length > 0;
      }
      return Number(vRecipients) > 0;
    },

    canSendNow: function (sJobId, sBusyJobId) {
      return !!normalize(sJobId) && normalize(sJobId) !== normalize(sBusyJobId);
    },

    formatAttachmentText: function (sFileName, vFileSize) {
      var iFileSize = Number(vFileSize) || 0;
      return sFileName && iFileSize > 0 ? sFileName : "No attachment generated";
    },

    formatAttachmentTooltip: function () {
      return "Attachment generation requires backend export integration.";
    }
  };
});
