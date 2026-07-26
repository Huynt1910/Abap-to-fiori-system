sap.ui.define([], function () {
  "use strict";

  function normalize(vValue) {
    return String(vValue === null || vValue === undefined ? "" : vValue).trim();
  }

  function criticalityToState(vCriticality) {
    var sValue = normalize(vCriticality).toUpperCase();

    if (sValue === "1" || sValue === "ERROR" || sValue === "NEGATIVE" || sValue === "HIGH") {
      return "Error";
    }

    if (sValue === "2" || sValue === "WARNING" || sValue === "CRITICAL" || sValue === "MEDIUM") {
      return "Warning";
    }

    if (sValue === "3" || sValue === "SUCCESS" || sValue === "GOOD" || sValue === "POSITIVE" || sValue === "LOW") {
      return "Success";
    }

    if (sValue === "5" || sValue === "INFORMATION" || sValue === "INFO") {
      return "Information";
    }

    return "None";
  }

  function statusToState(sStatus, vCriticality) {
    var sValue = normalize(sStatus).toUpperCase();

    if (sValue === "FAILED" || sValue === "ERROR") {
      return "Error";
    }

    if (sValue === "RUNNING" || sValue === "IN_PROGRESS" || sValue === "PROCESSING") {
      return "Information";
    }

    if (sValue === "COMPLETED" || sValue === "COMPLETE" || sValue === "SUCCESS") {
      return "Success";
    }

    return criticalityToState(vCriticality);
  }

  function formatInteger(vValue) {
    var iValue = parseInt(vValue, 10);
    return isNaN(iValue) ? "-" : iValue.toLocaleString();
  }

  return {
    hasItems: function (aItems) {
      return Array.isArray(aItems) && aItems.length > 0;
    },

    hasNoItems: function (aItems) {
      return !Array.isArray(aItems) || aItems.length === 0;
    },

    hasValue: function (vValue) {
      return !!normalize(vValue);
    },

    formatCountText: function (vCount) {
      var iValue = parseInt(vCount, 10);
      return isNaN(iValue) ? "(0)" : "(" + iValue.toLocaleString() + ")";
    },

    formatCriticalityState: function (vCriticality) {
      return criticalityToState(vCriticality);
    },

    formatComplexityState: function (sLevel) {
      var sValue = normalize(sLevel).toUpperCase();

      if (sValue === "HIGH" || sValue === "VERY_HIGH" || sValue === "CRITICAL") {
        return "Error";
      }

      if (sValue === "MEDIUM" || sValue === "MODERATE") {
        return "Warning";
      }

      if (sValue === "LOW" || sValue === "SIMPLE") {
        return "Success";
      }

      return "None";
    },

    formatPriorityState: function (sPriority) {
      var sValue = normalize(sPriority).toUpperCase();

      if (sValue === "HIGH" || sValue === "CRITICAL" || sValue === "1") {
        return "Error";
      }

      if (sValue === "MEDIUM" || sValue === "2") {
        return "Warning";
      }

      if (sValue === "LOW" || sValue === "3") {
        return "Success";
      }

      return "None";
    },

    formatScoreText: function (vValue) {
      return formatInteger(vValue);
    },

    formatStatusState: function (sStatus, vCriticality) {
      return statusToState(sStatus, vCriticality);
    },

    formatStatusIcon: function (sStatus, vCriticality) {
      var sState = statusToState(sStatus, vCriticality);

      if (sState === "Success") {
        return "sap-icon://sys-enter-2";
      }

      if (sState === "Warning") {
        return "sap-icon://alert";
      }

      if (sState === "Error") {
        return "sap-icon://error";
      }

      if (sState === "Information") {
        return "sap-icon://message-information";
      }

      return "";
    },

    formatText: function (vValue) {
      var sValue = normalize(vValue);
      return sValue || "-";
    },

    formatNumber: function (vValue) {
      return formatInteger(vValue);
    },

    formatBoolean: function (vValue) {
      return vValue === true ? "Yes" : vValue === false ? "No" : "-";
    },

    formatDateTime: function (vValue) {
      if (!vValue) {
        return "-";
      }

      var oDate = vValue instanceof Date ? vValue : new Date(vValue);
      return isNaN(oDate.getTime()) ? String(vValue) : oDate.toLocaleString();
    }
  };
});
