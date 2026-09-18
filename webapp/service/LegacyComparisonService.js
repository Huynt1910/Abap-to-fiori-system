sap.ui.define([
  "sap/ui/model/odata/v4/ODataModel",
  "abap/to/fiori/system/util/Constants",
  "abap/to/fiori/system/util/FioriUiReportConfig",
  "abap/to/fiori/system/util/LegacyComparison"
], function (ODataModel, Constants, ReportConfig, Comparison) {
  "use strict";

  function LegacyComparisonService(oAnalysisModel, fnFetch, sOrigin) {
    this._oModel = oAnalysisModel;
    this._fnFetch = fnFetch || window.fetch.bind(window);
    this._sOrigin = sOrigin || window.location.origin;
  }

  LegacyComparisonService.prototype._action = function (sAnalysisId, sSuffix, oParameters) {
    var oBinding = this._oModel.bindContext("/Analyses(" + encodeURIComponent(sAnalysisId) + ")/" +
      Constants.service.namespace + "." + sSuffix + "(...)");
    Object.keys(oParameters).forEach(function (sName) { oBinding.setParameter(sName, oParameters[sName]); });
    return oBinding.execute("$direct").then(function () {
      var oContext = oBinding.getBoundContext();
      return oContext ? oContext.requestObject() : {};
    });
  };

  LegacyComparisonService.prototype.captureLegacyRows = function (sAnalysisId, sRequestId, sSelectionJson) {
    return this._action(sAnalysisId, "CaptureLegacyRows", {
      RequestId: sRequestId,
      SelectionJson: sSelectionJson
    });
  };

  LegacyComparisonService.prototype.getLegacyCapture = function (sAnalysisId, sRequestId) {
    return this._action(sAnalysisId, "GetLegacyCapture", { RequestId: sRequestId });
  };

  LegacyComparisonService.prototype.getEntityMetadata = function (sServiceRoot, sEntitySet) {
    var sRoot = ReportConfig.serviceUrl(sServiceRoot);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(sEntitySet)) {
      return Promise.reject(new Error("Invalid OData entity set name."));
    }
    var oModel = new ODataModel({ serviceUrl: sRoot, synchronizationMode: "None",
      operationMode: "Server", groupId: "$direct", updateGroupId: "$direct" });
    var oMeta = oModel.getMetaModel();
    return Promise.all([
      oMeta.requestObject("/$EntityContainer/"),
      oMeta.requestObject("/" + sEntitySet + "/")
    ]).then(function (aResult) {
      if (!aResult[0] || !aResult[0][sEntitySet] || aResult[0][sEntitySet].$kind !== "EntitySet" ||
          !aResult[1] || aResult[1].$kind !== "EntityType") {
        throw new Error("Entity set is missing from generated OData metadata.");
      }
      var oTypes = {};
      Object.keys(aResult[1]).forEach(function (sName) {
        var oProperty = aResult[1][sName];
        if (oProperty && oProperty.$kind === "Property") { oTypes[sName] = oProperty.$Type; }
      });
      var aKeys = aResult[1].$Key || [];
      if (!Array.isArray(aKeys) || aKeys.some(function (vKey) {
        return typeof vKey !== "string" || !Object.prototype.hasOwnProperty.call(oTypes, vKey);
      })) {
        throw new Error("Generated OData metadata has invalid entity keys.");
      }
      return { types: oTypes, keys: aKeys };
    }).finally(function () { oModel.destroy(); });
  };

  LegacyComparisonService.prototype.getTypes = function (sServiceRoot, sEntitySet) {
    return this.getEntityMetadata(sServiceRoot, sEntitySet).then(function (oMetadata) {
      return oMetadata.types;
    });
  };

  LegacyComparisonService.prototype._literal = function (vValue, sType) {
    if (vValue === null) { throw new Error("Null capture parameters cannot be mapped to an EQ filter."); }
    Comparison.canonical(vValue, sType);
    if (sType === "Edm.String") {
      return "'" + vValue.replace(/'/g, "''") + "'";
    }
    return String(vValue);
  };

  LegacyComparisonService.prototype._url = function (sRoot, sEntitySet, oParameters, oFilters, oColumns, oTypes) {
    var sServiceRoot = ReportConfig.serviceUrl(sRoot);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(sEntitySet)) {
      throw new Error("Invalid OData entity set name.");
    }
    var oRoot = new URL(sServiceRoot, this._sOrigin);
    var oUrl = new URL(sEntitySet, oRoot);
    oRoot.searchParams.forEach(function (sValue, sName) { oUrl.searchParams.set(sName, sValue); });
    var aConditions = [];
    Object.keys(oParameters).forEach(function (sParameter) {
      var sField = oFilters[sParameter];
      if (!sField || !oTypes[sField]) {
        throw new Error("No valid OData filter mapping for parameter " + sParameter + ".");
      }
      aConditions.push(sField + " eq " + this._literal(oParameters[sParameter], oTypes[sField]));
    }.bind(this));
    if (new Set(Object.keys(oParameters).map(function (sName) { return oFilters[sName]; })).size !==
        Object.keys(oParameters).length) {
      throw new Error("Multiple parameters map to one OData filter.");
    }
    if (aConditions.length) { oUrl.searchParams.set("$filter", aConditions.join(" and ")); }
    var aSelect = Array.from(new Set(Object.keys(oColumns).map(function (sName) {
      return oColumns[sName];
    })));
    if (!aSelect.length) {
      throw new Error("No ALV columns match OData properties for comparison.");
    }
    var aMissing = aSelect.filter(function (sName) {
      return !Object.prototype.hasOwnProperty.call(oTypes, sName) || !oTypes[sName];
    });
    if (aMissing.length) {
      var aAvailable = Object.keys(oTypes);
      throw new Error("EntitySet '" + sEntitySet + "' has no OData property: " + aMissing.join(", ") +
        ". Check exact property names and letter case in the generated service. Available properties: " +
        (aAvailable.slice(0, 30).join(", ") || "(none)") + (aAvailable.length > 30 ? ", ..." : "") + ".");
    }
    oUrl.searchParams.set("$select", aSelect.join(","));
    return { url: oUrl, root: oRoot };
  };

  LegacyComparisonService.prototype.readAllRows = function (sRoot, sEntitySet, oParameters, oFilters, oColumns, oTypes, fnPageProgress) {
    var oStart = this._url(sRoot, sEntitySet, oParameters, oFilters, oColumns, oTypes);
    var aRows = [];
    var oSeen = new Set();
    var oCurrent = oStart.url;
    var fnFetch = this._fnFetch;
    var sEntityPath = oStart.url.pathname;
    var sClient = oStart.root.searchParams.get("sap-client");
    var nExpectedCount = null;
    var nPage = 0;
    function page() {
      if (oCurrent.origin !== oStart.root.origin || oCurrent.pathname !== sEntityPath) {
        throw new Error("Invalid or repeated @odata.nextLink; OData paging is incomplete.");
      }
      if (sClient && !oCurrent.searchParams.has("sap-client")) {
        oCurrent.searchParams.set("sap-client", sClient);
      }
      if (sClient && oCurrent.searchParams.get("sap-client") !== sClient) {
        throw new Error("@odata.nextLink changed sap-client; OData paging is incomplete.");
      }
      if (oSeen.has(oCurrent.href)) {
        throw new Error("Invalid or repeated @odata.nextLink; OData paging is incomplete.");
      }
      oSeen.add(oCurrent.href);
      return fnFetch(oCurrent.href, { method: "GET", credentials: "include",
        headers: { Accept: "application/json" } }).then(function (oResponse) {
        if (!oResponse.ok) { throw new Error("OData page failed: HTTP " + oResponse.status + "."); }
        return oResponse.json();
      }).then(function (oData) {
        if (!oData || !Array.isArray(oData.value) || oData.value.some(function (oRow) {
          return !oRow || typeof oRow !== "object" || Array.isArray(oRow);
        })) {
          throw new Error("OData page has no valid value array.");
        }
        aRows = aRows.concat(oData.value);
        if (oData["@odata.count"] !== undefined) {
          var nCount = Number(oData["@odata.count"]);
          if (!Number.isSafeInteger(nCount) || nCount < 0 ||
              (nExpectedCount !== null && nExpectedCount !== nCount)) {
            throw new Error("OData count is inconsistent across pages.");
          }
          nExpectedCount = nCount;
        }
        if (Object.prototype.hasOwnProperty.call(oData, "@odata.nextLink") &&
            (typeof oData["@odata.nextLink"] !== "string" || !oData["@odata.nextLink"])) {
          throw new Error("Invalid @odata.nextLink; OData paging is incomplete.");
        }
        nPage += 1;
        if (typeof fnPageProgress === "function") {
          fnPageProgress({ page: nPage, rows: oData.value.length, totalRows: aRows.length,
            hasNext: !!oData["@odata.nextLink"] });
        }
        if (oData["@odata.nextLink"]) {
          oCurrent = new URL(oData["@odata.nextLink"], oCurrent);
          if (oCurrent.origin !== oStart.root.origin) {
            if (oCurrent.pathname !== sEntityPath || oCurrent.username || oCurrent.password ||
                (oCurrent.protocol !== "https:" && oCurrent.protocol !== "http:")) {
              throw new Error("Invalid @odata.nextLink; OData paging is incomplete.");
            }
            oCurrent = new URL(oCurrent.pathname + oCurrent.search, oStart.root.origin);
          }
          return page();
        }
        if (nExpectedCount !== null && nExpectedCount !== aRows.length) {
          throw new Error("OData count does not match the rows fetched from all pages.");
        }
        return aRows;
      });
    }
    return Promise.resolve().then(page);
  };

  return LegacyComparisonService;
});
