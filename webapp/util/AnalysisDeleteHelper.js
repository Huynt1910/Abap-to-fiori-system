sap.ui.define([
  "abap/to/fiori/system/util/ODataErrorHandler"
], function (ODataErrorHandler) {
  "use strict";

  function getContextProperty(oContext, sPath) {
    var oObject;
    var aParts;

    if (!oContext) {
      return undefined;
    }

    if (typeof oContext.getProperty === "function") {
      return oContext.getProperty(sPath);
    }

    oObject = typeof oContext.getObject === "function" ? oContext.getObject() : oContext;
    aParts = String(sPath || "").split("/");

    return aParts.reduce(function (vValue, sPart) {
      return vValue && vValue[sPart];
    }, oObject);
  }

  function getProgramName(oContext) {
    return String(getContextProperty(oContext, "ProgramName") || "").trim() || "-";
  }

  function isDeletable(oContext) {
    return getContextProperty(oContext, "__EntityControl/Deletable") === true;
  }

  function splitByDeletePermission(aContexts) {
    var aDeletableContexts = [];
    var aBlockedContexts = [];

    (aContexts || []).forEach(function (oContext) {
      if (isDeletable(oContext)) {
        aDeletableContexts.push(oContext);
      } else {
        aBlockedContexts.push(oContext);
      }
    });

    return {
      deletableContexts: aDeletableContexts,
      blockedContexts: aBlockedContexts
    };
  }

  function buildProgramPreview(aContexts, iLimit) {
    var iMax = iLimit || 5;
    var aNames = (aContexts || []).slice(0, iMax).map(getProgramName);
    var iRemaining = Math.max((aContexts || []).length - iMax, 0);

    return {
      names: aNames,
      remaining: iRemaining
    };
  }

  function summarizeDeleteResults(aResults, aContexts, iBlockedCount) {
    var aFailures = [];
    var iSuccessCount = 0;

    (aResults || []).forEach(function (oResult, iIndex) {
      var oContext = aContexts && aContexts[iIndex];
      var sProgramName = getProgramName(oContext);
      var sMessage;

      if (oResult && oResult.status === "fulfilled") {
        iSuccessCount += 1;
        return;
      }

      sMessage = ODataErrorHandler.parse(oResult && oResult.reason).message;
      aFailures.push({
        programName: sProgramName,
        message: sMessage || "Unexpected error."
      });
    });

    return {
      successCount: iSuccessCount,
      failedCount: aFailures.length,
      blockedCount: iBlockedCount || 0,
      failures: aFailures
    };
  }

  return {
    getContextProperty: getContextProperty,
    getProgramName: getProgramName,
    isDeletable: isDeletable,
    splitByDeletePermission: splitByDeletePermission,
    buildProgramPreview: buildProgramPreview,
    summarizeDeleteResults: summarizeDeleteResults
  };
});
