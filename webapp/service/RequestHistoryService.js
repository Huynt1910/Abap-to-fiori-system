sap.ui.define([
  "abap/to/fiori/system/util/Constants"
], function (Constants) {
  "use strict";

  // The manifest service URI provides the service root and SAP client. Browser cookies
  // provide the current SAP session; no user identifier is accepted by this API.
  function RequestHistoryService(oModel, sServiceUrl, fnFetch, sOrigin) {
    this._oModel = oModel;
    this._sServiceUrl = sServiceUrl;
    this._fnFetch = fnFetch || window.fetch.bind(window);
    this._sOrigin = sOrigin || window.location.origin;
    this._pMetadata = null;
  }

  RequestHistoryService.prototype._validateMetadata = function () {
    if (this._pMetadata) { return this._pMetadata; }
    var oMeta = this._oModel.getMetaModel();
    var aSets = [
      { name: "CaptureRequests", fields: Constants.field.captureRequests },
      { name: "GenerationRequests", fields: Constants.field.generationRequests }
    ];
    this._pMetadata = Promise.all(aSets.map(function (oSet) {
      return Promise.all([
        oMeta.requestObject("/$EntityContainer/"),
        oMeta.requestObject("/" + oSet.name + "/")
      ]).then(function (aResult) {
        var oEntitySet = aResult[0] && aResult[0][oSet.name];
        var oType = aResult[1];
        if (!oEntitySet || oEntitySet.$kind !== "EntitySet" || !oType || oType.$kind !== "EntityType") {
          throw new Error(oSet.name + " is missing from OData metadata.");
        }
        oSet.fields.forEach(function (sField) {
          var oProperty = oType[sField];
          if (!oProperty || oProperty.$kind !== "Property" || !oProperty.$Type) {
            throw new Error(oSet.name + "." + sField + " is missing from OData metadata.");
          }
          var sType = oProperty.$Type;
          var bValid = sField === "CreatedAt" || sField === "UpdatedAt" ?
            sType === "Edm.DateTimeOffset" :
            sField === "CountRow" ? sType === "Edm.Int32" :
            sField === "RequestId" || sField === "AnalysisId" ?
              sType === "Edm.Guid" : sType === "Edm.String";
          if (!bValid) {
            throw new Error(oSet.name + "." + sField + " has unexpected OData type " + sType + ".");
          }
        });
      });
    })).catch(function (oError) {
      this._pMetadata = null;
      throw oError;
    }.bind(this));
    return this._pMetadata;
  };

  RequestHistoryService.prototype._readAll = function (sEntitySet, aFields) {
    var oRoot = new URL(this._sServiceUrl, this._sOrigin);
    var oUrl = new URL(sEntitySet, oRoot);
    var sClient = oRoot.searchParams.get("sap-client");
    var sEntityPath = oUrl.pathname;
    var mSeen = {};
    var aRows = [];
    var fnFetch = this._fnFetch;
    if (oRoot.origin !== this._sOrigin || !oRoot.pathname.endsWith("/")) {
      return Promise.reject(new Error("Invalid configured analysis service URL."));
    }
    oRoot.searchParams.forEach(function (sValue, sName) { oUrl.searchParams.set(sName, sValue); });
    oUrl.searchParams.set("$select", aFields.join(","));
    function nextPage() {
      if (oUrl.origin !== oRoot.origin || oUrl.pathname !== sEntityPath ||
          (sClient && oUrl.searchParams.get("sap-client") !== sClient) || mSeen[oUrl.href]) {
        throw new Error("Invalid or repeated @odata.nextLink in request history.");
      }
      mSeen[oUrl.href] = true;
      return fnFetch(oUrl.href, { method: "GET", credentials: "include",
        headers: { Accept: "application/json" } }).then(function (oResponse) {
        if (!oResponse.ok) { throw new Error("Request history GET failed: HTTP " + oResponse.status + "."); }
        return oResponse.json();
      }).then(function (oData) {
        if (!oData || !Array.isArray(oData.value)) {
          throw new Error("Request history response has no value array.");
        }
        aRows = aRows.concat(oData.value);
        var sNext = oData["@odata.nextLink"];
        if (sNext === undefined) { return aRows; }
        if (typeof sNext !== "string" || !sNext) {
          throw new Error("Invalid @odata.nextLink in request history.");
        }
        var oNext = new URL(sNext, oUrl);
        // An SAP backend may emit its absolute host while local development uses /sap proxy.
        // Keep every page on the configured same-origin service path.
        if (oNext.origin !== oRoot.origin) {
          if (oNext.pathname !== sEntityPath || oNext.username || oNext.password ||
              (oNext.protocol !== "https:" && oNext.protocol !== "http:")) {
            throw new Error("Invalid @odata.nextLink in request history.");
          }
          oNext = new URL(oNext.pathname + oNext.search, oRoot.origin);
        }
        oUrl = oNext;
        if (sClient && !oUrl.searchParams.has("sap-client")) {
          oUrl.searchParams.set("sap-client", sClient);
        }
        return nextPage();
      });
    }
    return Promise.resolve().then(nextPage);
  };

  RequestHistoryService.prototype.readMyRequests = function () {
    return this._validateMetadata().then(function () {
      return Promise.all([
        this._readAll(Constants.entitySet.captureRequests.slice(1), Constants.field.captureRequests),
        this._readAll(Constants.entitySet.generationRequests.slice(1), Constants.field.generationRequests)
      ]);
    }.bind(this)).then(function (aResults) {
      return { captures: aResults[0], generations: aResults[1] };
    });
  };

  return RequestHistoryService;
});
