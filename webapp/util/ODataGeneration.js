sap.ui.define([], function () {
  "use strict";

  var ZERO_UUID = "00000000-0000-0000-0000-000000000000";

  function normalizeUpper(vValue) {
    return String(vValue || "").trim().toUpperCase();
  }

  function isZeroUuid(vValue) {
    return String(vValue || "").trim().toLowerCase() === ZERO_UUID;
  }

  function isUsableRequestId(vValue) {
    return !!String(vValue || "").trim() && !isZeroUuid(vValue);
  }

  function isGenerationActive(sStatus) {
    return sStatus === "QUEUED" || sStatus === "DISPATCHING" ||
      sStatus === "SCHEDULED" || sStatus === "RUNNING";
  }

  function sameId(vLeft, vRight) {
    return !!String(vLeft || "").trim() &&
      String(vLeft || "").trim().toLowerCase() === String(vRight || "").trim().toLowerCase();
  }

  function normalizeParameters(oState, sRequestId) {
    var sProviderLanguage = normalizeUpper(oState && oState.providerLanguage) || "STANDARD";
    return {
      TargetPackage: normalizeUpper(oState && oState.targetPackage),
      ProviderPackage: sProviderLanguage === "CLOUD" ? "" : normalizeUpper(oState && oState.providerPackage),
      ProviderLanguage: sProviderLanguage,
      TransportRequest: normalizeUpper(oState && oState.transportRequest),
      RequestId: sRequestId || ZERO_UUID
    };
  }

  function signature(oState) {
    var oParameters = normalizeParameters(oState, ZERO_UUID);
    return [
      oParameters.TargetPackage,
      oParameters.ProviderPackage,
      oParameters.ProviderLanguage,
      oParameters.TransportRequest
    ].join("|");
  }

  function parseResponse(oResponse) {
    var sResultJson = String(oResponse && oResponse.ResultJson || "").trim();
    var oResult = {};
    var bInvalid = false;

    if (!sResultJson) {
      bInvalid = true;
    } else {
      try {
        oResult = JSON.parse(sResultJson);
        if (!oResult || typeof oResult !== "object" || Array.isArray(oResult)) {
          oResult = {};
          bInvalid = true;
        }
      } catch (oError) {
        bInvalid = true;
      }
    }

    return {
      analysisId: oResponse && oResponse.AnalysisId || "",
      requestId: oResponse && oResponse.RequestId || "",
      status: oResponse && oResponse.Status || "",
      runtimeCheck: oResponse && oResponse.RuntimeCheck || "",
      message: oResponse && oResponse.Message || "",
      result: oResult,
      resultJsonInvalid: bInvalid
    };
  }

  function deploymentMode(oParsed) {
    var sStatus = normalizeUpper(oParsed && oParsed.status);
    var sServiceUrl = String(oParsed && oParsed.result && oParsed.result.serviceUrl || "").trim();

    if (!sServiceUrl) {
      return "";
    }
    if (sStatus === "GENERATED") {
      return "REUSE";
    }
    if (sStatus === "STALE") {
      return "STALE";
    }
    return "";
  }

  function hasReusableDeployment(oState, sAnalysisId) {
    return !!oState &&
      normalizeUpper(oState.status) === "GENERATED" &&
      !!String(oState.result && oState.result.serviceUrl || "").trim() &&
      sameId(oState.resultAnalysisId, sAnalysisId);
  }

  function cachedDeploymentMode(oState, sAnalysisId) {
    if (hasReusableDeployment(oState, sAnalysisId)) {
      return "REUSE";
    }
    return oState && sameId(oState.resultAnalysisId, sAnalysisId) && deploymentMode(oState) === "STALE" ?
      "STALE" : "";
  }

  function collectErrorText(oError, oParsedError) {
    var aValues = [];

    function add(vValue) {
      if (vValue !== null && vValue !== undefined && vValue !== "") {
        aValues.push(String(vValue));
      }
    }

    function addObject(oValue) {
      var oPayload;
      if (!oValue || typeof oValue !== "object") {
        return;
      }
      add(oValue.code);
      add(oValue.message && oValue.message.value || oValue.message);
      add(oValue.error && oValue.error.code);
      add(oValue.error && oValue.error.message && oValue.error.message.value ||
        oValue.error && oValue.error.message);
      if (typeof oValue.responseText === "string") {
        add(oValue.responseText);
        try {
          oPayload = JSON.parse(oValue.responseText);
          addObject(oPayload);
        } catch (oIgnored) {
          // Raw response text is still checked below.
        }
      }
      if (oValue.response) {
        addObject(oValue.response);
      }
    }

    addObject(oError);
    addObject(oParsedError);
    return aValues.join(" ");
  }

  function isMissingGenerationInputError(oError, oParsedError) {
    var sText = collectErrorText(oError, oParsedError);
    return /analysis\s*id\s*\/\s*target\s*package\s+(?:is\s+)?required/i.test(sText) ||
      /target\s+package\s+is\s+required/i.test(sText) ||
      /analysis[_\s-]*id[_\s-]*target[_\s-]*package[_\s-]*required/i.test(sText) ||
      /target[_\s-]*package[_\s-]*required/i.test(sText);
  }

  function fallbackUuid() {
    var aBytes = [];
    var i;
    var sHex;

    for (i = 0; i < 16; i += 1) {
      aBytes[i] = Math.floor(Math.random() * 256);
    }
    aBytes[6] = (aBytes[6] & 15) | 64;
    aBytes[8] = (aBytes[8] & 63) | 128;
    sHex = aBytes.map(function (iByte) {
      return iByte.toString(16).padStart(2, "0");
    }).join("");
    return sHex.slice(0, 8) + "-" + sHex.slice(8, 12) + "-" + sHex.slice(12, 16) + "-" +
      sHex.slice(16, 20) + "-" + sHex.slice(20);
  }

  function createUuid() {
    var oCrypto = typeof crypto !== "undefined" ? crypto : null;
    return oCrypto && typeof oCrypto.randomUUID === "function" ? oCrypto.randomUUID() : fallbackUuid();
  }

  return Object.freeze({
    ZERO_UUID: ZERO_UUID,
    normalizeUpper: normalizeUpper,
    isZeroUuid: isZeroUuid,
    isUsableRequestId: isUsableRequestId,
    isGenerationActive: isGenerationActive,
    sameId: sameId,
    normalizeParameters: normalizeParameters,
    signature: signature,
    parseResponse: parseResponse,
    deploymentMode: deploymentMode,
    hasReusableDeployment: hasReusableDeployment,
    cachedDeploymentMode: cachedDeploymentMode,
    isMissingGenerationInputError: isMissingGenerationInputError,
    createUuid: createUuid
  });
});
