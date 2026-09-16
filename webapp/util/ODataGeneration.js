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
    return sStatus === "QUEUED" || sStatus === "RUNNING";
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
    normalizeParameters: normalizeParameters,
    signature: signature,
    parseResponse: parseResponse,
    createUuid: createUuid
  });
});
