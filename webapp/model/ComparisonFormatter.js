sap.ui.define([], function () {
  "use strict";

  function normalize(vValue) {
    return String(vValue || "").trim();
  }

  return {
    formatText: function (vValue) {
      var sValue = normalize(vValue);
      return sValue || "-";
    },

    statusToValueState: function (sStatus) {
      var sValue = normalize(sStatus).toUpperCase();

      if (["MAPPED", "COMPATIBLE", "COMPLETED", "SUCCESS", "HIGH_COMPATIBILITY"].indexOf(sValue) !== -1) {
        return "Success";
      }
      if (["REFACTOR", "REFACTORING", "MANUAL", "WARNING", "MEDIUM_COMPATIBILITY"].indexOf(sValue) !== -1) {
        return "Warning";
      }
      if (["UNSUPPORTED", "FAILED", "ERROR", "LOW_COMPATIBILITY"].indexOf(sValue) !== -1) {
        return "Error";
      }
      if (["QUEUED", "RUNNING", "PROCESSING"].indexOf(sValue) !== -1) {
        return "Information";
      }
      return "None";
    },

    formatCompatibilityRate: function (vValue) {
      var fValue = Number(vValue);

      if (!isFinite(fValue)) {
        return "-";
      }

      return fValue.toFixed(2);
    },

    formatCount: function (vValue) {
      var iValue = Number(vValue);
      return isFinite(iValue) ? String(iValue) : "0";
    },

    formatDateTime: function (vValue) {
      if (!vValue) {
        return "-";
      }
      var oDate = vValue instanceof Date ? vValue : new Date(vValue);
      return isNaN(oDate.getTime()) ? normalize(vValue) : oDate.toLocaleString();
    }
  };
});
