sap.ui.define([], function () {
  "use strict";

  function normalize(vValue) {
    return String(vValue === null || vValue === undefined ? "" : vValue).trim();
  }

  function extractPayload(oError) {
    var sRawText;

    if (!oError) {
      return null;
    }

    if (typeof oError.responseText === "string") {
      sRawText = oError.responseText;
      return parseJson(sRawText) || extractJsonFromMultipart(sRawText);
    }

    if (oError.response && typeof oError.response.responseText === "string") {
      sRawText = oError.response.responseText;
      return parseJson(sRawText) || extractJsonFromMultipart(sRawText);
    }

    if (typeof oError.message === "string") {
      sRawText = oError.message;
      return parseJson(sRawText) || extractJsonFromMultipart(sRawText);
    }

    return null;
  }

  function parseJson(sText) {
    try {
      return JSON.parse(sText);
    } catch (e) {
      return null;
    }
  }

  function extractJsonFromMultipart(sText) {
    var sValue = normalize(sText);
    var iStart;
    var iEnd;

    if (!sValue) {
      return null;
    }

    iStart = sValue.indexOf("{\"error\"");
    if (iStart < 0) {
      iStart = sValue.indexOf("{");
    }
    if (iStart < 0) {
      return null;
    }

    iEnd = sValue.lastIndexOf("}");
    if (iEnd <= iStart) {
      return null;
    }

    return parseJson(sValue.slice(iStart, iEnd + 1));
  }

  function extractSapMessages(oPayload) {
    var aMessages = [];
    var aDetails = oPayload && oPayload.error && oPayload.error.details;

    if (Array.isArray(aDetails)) {
      aDetails.forEach(function (oDetail) {
        if (oDetail && oDetail.message) {
          aMessages.push({
            code: oDetail.code || "",
            message: oDetail.message,
            severity: oDetail["@Common.numericSeverity"] || oDetail.severity || ""
          });
        }
      });
    }

    return aMessages;
  }

  function extractErrorMessage(oPayload) {
    var vMessage = oPayload && oPayload.error && oPayload.error.message || oPayload && oPayload.message;

    if (typeof vMessage === "string") {
      return normalize(vMessage);
    }

    if (vMessage && typeof vMessage.value === "string") {
      return normalize(vMessage.value);
    }

    return "";
  }

  function extractErrorCode(oPayload) {
    return normalize(oPayload && oPayload.error && oPayload.error.code || oPayload && oPayload.code);
  }

  function getStatus(oError) {
    return Number(
      oError && (
        oError.status ||
        oError.statusCode ||
        oError.response && (oError.response.status || oError.response.statusCode)
      )
    ) || 0;
  }

  function getTransactionId(oError) {
    var oHeaders = oError && oError.response && oError.response.headers || oError && oError.headers;
    if (!oHeaders) {
      return "";
    }

    if (typeof oHeaders.get === "function") {
      return oHeaders.get("sap-message-id") || oHeaders.get("x-correlationid") || oHeaders.get("x-request-id") || "";
    }

    return oHeaders["sap-message-id"] || oHeaders["x-correlationid"] || oHeaders["x-request-id"] || "";
  }

  function friendlyMessage(oError) {
    var iStatus = getStatus(oError);
    var oPayload = extractPayload(oError);
    var sPayloadMessage = extractErrorMessage(oPayload);
    var sPayloadCode = extractErrorCode(oPayload);
    var sMessage = normalize(oError && oError.message) || sPayloadMessage;
    var sCombinedMessage = sPayloadCode + " " + sMessage + " " + sPayloadMessage;

    if (/ignoring response from inactive cache/i.test(sCombinedMessage)) {
      return "";
    }

    if (sPayloadMessage) {
      return sPayloadMessage;
    }

    if (/ZMIG_ANALYSIS\/023|email address is not maintained|no email address/i.test(sCombinedMessage)) {
      return "The SAP user has no email address maintained in SU01.";
    }

    if (/CX_SXML_PARSE_ERROR|Fehler beim Parsen|parse error/i.test(sCombinedMessage)) {
      return "The Mail Job request payload could not be parsed by the backend. Please check date, time, day and required field values.";
    }

    if (iStatus === 400) {
      return sPayloadMessage || sMessage || "Validation error.";
    }
    if (iStatus === 401) {
      return "Authentication required.";
    }
    if (iStatus === 403) {
      return "Authorization or CSRF validation failed.";
    }
    if (iStatus === 404) {
      return "Mail Job not found.";
    }
    if (iStatus === 412) {
      return "This Mail Job was changed by another user. The latest data has been loaded. Please review and try again.";
    }
    if (iStatus === 500) {
      return sPayloadMessage || "Backend processing error.";
    }

    return sPayloadMessage || sMessage || "Unexpected error.";
  }

  function parse(oError) {
    var oPayload = extractPayload(oError);
    var sTransactionId = getTransactionId(oError);
    var sMessage = friendlyMessage(oError);

    if (sTransactionId) {
      sMessage += " Transaction ID: " + sTransactionId;
    }

    return {
      status: getStatus(oError),
      message: sMessage,
      code: extractErrorCode(oPayload),
      transactionId: sTransactionId,
      sapMessages: extractSapMessages(oPayload),
      raw: oError
    };
  }

  return {
    parse: parse,
    friendlyMessage: friendlyMessage,
    extractErrorMessage: extractErrorMessage,
    extractSapMessages: extractSapMessages
  };
});
