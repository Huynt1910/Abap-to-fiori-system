sap.ui.define([], function () {
  "use strict";

  function toNumber(vValue) {
    var fValue = parseFloat(vValue);
    return isNaN(fValue) ? 0 : fValue;
  }

  function normalize(vValue) {
    return String(vValue || "").trim().toUpperCase();
  }

  function criticalityToState(vCriticality) {
    var sCriticality = normalize(vCriticality);

    if (sCriticality === "1" || sCriticality === "GOOD" || sCriticality === "SUCCESS" || sCriticality === "POSITIVE" || sCriticality === "LOW") {
      return "Success";
    }

    if (sCriticality === "2" || sCriticality === "CRITICAL" || sCriticality === "WARNING" || sCriticality === "MEDIUM") {
      return "Warning";
    }

    if (sCriticality === "3" || sCriticality === "NEGATIVE" || sCriticality === "ERROR" || sCriticality === "HIGH") {
      return "Error";
    }

    return "None";
  }

  function statusToState(sStatus) {
    var sValue = normalize(sStatus);

    if (sValue === "COMPLETED" || sValue === "COMPLETE" || sValue === "ANALYZED" || sValue === "SUCCESS") {
      return "Success";
    }

    if (sValue === "IN PROGRESS" || sValue === "RUNNING" || sValue === "PROCESSING") {
      return "Information";
    }

    if (sValue === "FAILED" || sValue === "ERROR" || sValue === "INCOMPLETE") {
      return "Error";
    }

    return "None";
  }

  return {
    formatScore: function (vValue) {
      return toNumber(vValue).toFixed(0) + "%";
    },

    formatScoreValue: function (vValue) {
      return Math.max(0, Math.min(toNumber(vValue), 100));
    },

    formatScoreState: function (vValue) {
      var fValue = toNumber(vValue);

      if (fValue >= 75) {
        return "Success";
      }

      if (fValue >= 50) {
        return "Warning";
      }

      return "Error";
    },

    formatStatusState: function (sStatus, vCriticality) {
      var sStateFromStatus = statusToState(sStatus);
      return sStateFromStatus === "None" ? criticalityToState(vCriticality) : sStateFromStatus;
    },

    formatCriticalityToValueState: function (vCriticality) {
      return criticalityToState(vCriticality);
    },

    formatStatusIcon: function (sStatus, vCriticality) {
      var sStateFromStatus = statusToState(sStatus);
      var sState = sStateFromStatus === "None" ? criticalityToState(vCriticality) : sStateFromStatus;

      if (sState === "Success") {
        return "sap-icon://sys-enter-2";
      }

      if (sState === "Warning") {
        return "sap-icon://alert";
      }

      if (sState === "Error") {
        return "sap-icon://error";
      }

      return "";
    },

    formatNumber: function (vValue) {
      var iValue = parseInt(vValue, 10);
      return isNaN(iValue) ? "0" : iValue.toLocaleString();
    },

    formatStatusText: function (sStatus) {
      return sStatus || "Not Analyzed";
    }
  };
});
