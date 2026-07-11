sap.ui.define([
  "sap/m/MessageToast",
  "abap/to/fiori/system/util/Constants"
], function (MessageToast, Constants) {
  "use strict";

  function ODataService(oODataModel, sServiceRoot) {
    this._oModel = oODataModel;
    this._sServiceRoot = sServiceRoot;
    this._sCsrfToken = "";
  }

  ODataService.prototype.readList = function (sEntityPath, mParameters) {
    var mOptions = mParameters || {};
    var iTop = mOptions.top || 100;
    var oListBinding = this._oModel.bindList(
      sEntityPath,
      undefined,
      mOptions.sorters || [],
      mOptions.filters || [],
      mOptions.urlParameters || {}
    );

    return oListBinding.requestContexts(0, iTop)
      .then(function (aContexts) {
        return aContexts.map(function (oContext) {
          return oContext.getObject();
        });
      })
      .catch(function (oError) {
        MessageToast.show("OData request failed.");
        throw oError;
      });
  };

  ODataService.prototype.readAnalysisOverview = function (sProgramName) {
    return this.readSavedReportHeaders(sProgramName);
  };

  ODataService.prototype.readSavedReportHeaders = function (sProgramName) {
    var sProgramQuery = String(sProgramName || "").trim();
    var mQuery = {};

    if (sProgramQuery) {
      mQuery.$filter = Constants.Field.ProgramName + " eq '" + this._escapeODataString(sProgramQuery) + "'";
    }

    return this._requestEntitySetJson(Constants.EntitySet.SavedReportHeader, mQuery).then(function (oResponse) {
      return oResponse.value || [];
    });
  };

  ODataService.prototype.readSavedReportOverview = function (sProgramName) {
    var sProgramQuery = String(sProgramName || "").trim();

    if (!sProgramQuery) {
      return Promise.resolve(null);
    }

    return this._requestCsrfToken().then(function (sCsrfToken) {
      return this._requestEntitySetJson(Constants.EntitySet.SavedReportHeader, {
        iv_program_name: "'" + this._escapeODataString(sProgramQuery) + "'"
      }, {
        headers: sCsrfToken ? {
          "x-csrf-token": sCsrfToken
        } : {}
      });
    }.bind(this)).then(function (oResponse) {
      var aRows = oResponse.value || [];
      return aRows[0] || null;
    });
  };

  ODataService.prototype.analyzeAndSave = function (sProgramName) {
    var sProgramQuery = String(sProgramName || "").trim();

    if (!sProgramQuery) {
      return Promise.reject(new Error("Program Name is required."));
    }

    return this._requestCsrfToken().then(function (sCsrfToken) {
      var mHeaders = {
        "Content-Type": "application/json"
      };

      if (sCsrfToken) {
        mHeaders["x-csrf-token"] = sCsrfToken;
      }

      return this._requestJson(Constants.Action.AnalyzeAndSave, undefined, {
        method: "POST",
        headers: mHeaders,
        body: JSON.stringify({
          iv_program_name: sProgramQuery
        })
      });
    }.bind(this));
  };

  ODataService.prototype.deleteSavedReport = function (sReportId) {
    var sNormalizedReportId = String(sReportId || "").trim();

    if (!sNormalizedReportId) {
      return Promise.reject(new Error("ReportID is required."));
    }

    return this._requestCsrfToken().then(function (sCsrfToken) {
      var mHeaders = {};

      if (sCsrfToken) {
        mHeaders["x-csrf-token"] = sCsrfToken;
      }

      return this._requestJson(Constants.EntitySet.SavedReportHeader + "(ReportID=" + encodeURIComponent(sNormalizedReportId) + ")", undefined, {
        method: "DELETE",
        headers: mHeaders
      });
    }.bind(this));
  };

  ODataService.prototype.readUIFilters = function (sProgramName) {
    return this._readSavedReportAssociation(sProgramName, "_UiFilter");
  };

  ODataService.prototype.readDatabaseTables = function (sProgramName) {
    return this._readSavedReportAssociation(sProgramName, "_DbTable");
  };

  ODataService.prototype.readBusinessLogic = function (sProgramName) {
    return this._readSavedReportAssociation(sProgramName, "_BusinessLogic");
  };

  ODataService.prototype.readComparisonResults = function (sProgramName) {
    return this._requestCsrfToken().then(function (sCsrfToken) {
      return this._readEntitySetByProgramJson(Constants.EntitySet.ComparisonResult, sProgramName, {
        headers: sCsrfToken ? {
          "x-csrf-token": sCsrfToken
        } : {}
      });
    }.bind(this));
  };

  ODataService.prototype.readProgramDetails = function (sProgramName) {
    return Promise.allSettled([
      this.readSavedReportOverview(sProgramName),
      this._readProgramDetailSets(sProgramName)
    ]).then(function (aResults) {
      var oSavedOverview = aResults[0].status === "fulfilled" ? aResults[0].value : null;
      var oDetailSets = aResults[1].status === "fulfilled" ? aResults[1].value : {};

      return {
        overview: oSavedOverview || this._buildAnalysisOverview(sProgramName, oDetailSets),
        databaseTables: oDetailSets.databaseTables || [],
        uiFilters: oDetailSets.uiFilters || [],
        businessLogic: oDetailSets.businessLogic || [],
        comparisonResults: oDetailSets.comparisonResults || []
      };
    }.bind(this));
  };

  ODataService.prototype._readSynthesizedAnalysisOverview = function (sProgramName) {
    return this._readProgramDetailSets(sProgramName).then(function (oDetailSets) {
      var oOverview = this._buildAnalysisOverview(sProgramName, oDetailSets);

      return oOverview ? [oOverview] : [];
    }.bind(this));
  };

  ODataService.prototype._readProgramDetailSets = function (sProgramName) {
    return Promise.allSettled([
      this._readSavedReportHeaderWithExpand(sProgramName, ["_DbTable", "_UiFilter", "_BusinessLogic"]),
      this.readComparisonResults(sProgramName)
    ]).then(function (aResults) {
      var oExpandedReport = aResults[0].status === "fulfilled" ? aResults[0].value : {};
      var aComparisonResults = aResults[1].status === "fulfilled" ? aResults[1].value : [];

      return {
        databaseTables: this._extractExpandedCollection(oExpandedReport, "_DbTable"),
        uiFilters: this._extractExpandedCollection(oExpandedReport, "_UiFilter"),
        businessLogic: this._extractExpandedCollection(oExpandedReport, "_BusinessLogic"),
        comparisonResults: aComparisonResults
      };
    }.bind(this));
  };

  ODataService.prototype._readSavedReportAssociation = function (sProgramName, sAssociationName) {
    return this._readSavedReportHeaderWithExpand(sProgramName, [sAssociationName]).then(function (oReport) {
      return this._extractExpandedCollection(oReport, sAssociationName);
    }.bind(this));
  };

  ODataService.prototype._readSavedReportHeaderWithExpand = function (sProgramName, aAssociationNames) {
    var sProgramQuery = String(sProgramName || "").trim();

    if (!sProgramQuery) {
      return Promise.resolve(null);
    }

    return this._requestEntitySetJson(Constants.EntitySet.SavedReportHeader, {
      $filter: Constants.Field.ProgramName + " eq '" + this._escapeODataString(sProgramQuery) + "'",
      $expand: (aAssociationNames || []).join(",")
    }).then(function (oResponse) {
      var aRows = oResponse.value || [];
      return aRows[0] || null;
    });
  };

  ODataService.prototype._extractExpandedCollection = function (oReport, sAssociationName) {
    var vCollection = oReport && oReport[sAssociationName];

    if (Array.isArray(vCollection)) {
      return vCollection;
    }

    if (vCollection && Array.isArray(vCollection.value)) {
      return vCollection.value;
    }

    return [];
  };

  ODataService.prototype._buildAnalysisOverview = function (sProgramName, oDetailSets) {
    var aDatabaseTables = oDetailSets.databaseTables || [];
    var aUIFilters = oDetailSets.uiFilters || [];
    var aBusinessLogic = oDetailSets.businessLogic || [];
    var bHasData = aDatabaseTables.length || aUIFilters.length || aBusinessLogic.length;

    if (!bHasData) {
      return null;
    }

    return {
      ProgramName: sProgramName,
      ProgramDescription: sProgramName,
      AnalysisStatus: "COMPLETED",
      AnalysisStatusCriticality: 1,
      TotalTables: aDatabaseTables.length,
      TotalFilters: aUIFilters.length,
      TotalBusinessObjects: aBusinessLogic.length,
      MigrationScore: "",
      ComplexityScore: "",
      CloudReadinessScore: ""
    };
  };

  ODataService.prototype._readEntitySetByProgramJson = function (sEntityPath, sProgramName, mOptions) {
    var sProgramQuery = String(sProgramName || "").trim();
    var mQuery = {};

    if (sProgramQuery) {
      mQuery.$filter = Constants.Field.ProgramName + " eq '" + this._escapeODataString(sProgramQuery) + "'";
    }

    return this._requestEntitySetJson(sEntityPath, mQuery, mOptions).then(function (oResponse) {
      return oResponse.value || [];
    });
  };

  ODataService.prototype._requestEntitySetJson = function (sEntityPath, mQuery, mOptions) {
    return this._requestJson(sEntityPath, mQuery, mOptions);
  };

  ODataService.prototype._requestJson = function (sEntityPath, mQuery, mOptions) {
    var sUrl = this._buildUrl(sEntityPath, mQuery);
    var mFetchOptions = mOptions || {};
    var mHeaders = Object.assign({
      Accept: "application/json"
    }, mFetchOptions.headers || {});

    return fetch(sUrl, {
      method: mFetchOptions.method || "GET",
      credentials: "include",
      headers: mHeaders,
      body: mFetchOptions.body
    }).then(function (oResponse) {
      if (!oResponse.ok) {
        var oError = new Error("HTTP " + oResponse.status + " " + oResponse.statusText + " while requesting " + sUrl);
        oError.status = oResponse.status;
        oError.url = sUrl;
        throw oError;
      }

      if (oResponse.status === 204) {
        return {};
      }

      return oResponse.text().then(function (sBody) {
        return sBody ? JSON.parse(sBody) : {};
      });
    });
  };

  ODataService.prototype._requestCsrfToken = function () {
    var sUrl = this._buildUrl("", {});

    if (this._sCsrfToken) {
      return Promise.resolve(this._sCsrfToken);
    }

    return fetch(sUrl, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "x-csrf-token": "Fetch"
      }
    }).then(function (oResponse) {
      if (!oResponse.ok) {
        var oError = new Error("HTTP " + oResponse.status + " " + oResponse.statusText + " while fetching CSRF token");
        oError.status = oResponse.status;
        oError.url = sUrl;
        throw oError;
      }

      this._sCsrfToken = oResponse.headers.get("x-csrf-token") || "";
      return this._sCsrfToken;
    }.bind(this));
  };

  ODataService.prototype._buildUrl = function (sEntityPath, mQuery) {
    var sServiceRoot = this._sServiceRoot || "";
    var sNormalizedRoot = sServiceRoot.slice(-1) === "/" ? sServiceRoot : sServiceRoot + "/";
    var sNormalizedEntityPath = String(sEntityPath || "").replace(/^\//, "");
    var aQueryParts = Object.keys(mQuery || {}).map(function (sKey) {
      return sKey + "=" + encodeURIComponent(mQuery[sKey]);
    });

    return sNormalizedRoot + sNormalizedEntityPath + (aQueryParts.length ? "?" + aQueryParts.join("&") : "");
  };

  ODataService.prototype._escapeODataString = function (sValue) {
    return String(sValue || "").replace(/'/g, "''");
  };

  return ODataService;
});
