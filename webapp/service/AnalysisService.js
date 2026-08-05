sap.ui.define([
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/model/Sorter",
  "abap/to/fiori/system/util/Constants"
], function (Filter, FilterOperator, Sorter, Constants) {
  "use strict";

  function AnalysisService(oODataModel) {
    this._oModel = oODataModel;
  }

  AnalysisService.prototype.readAnalyses = function (mOptions) {
    var mReadOptions = mOptions || {};
    var aFilters = [];

    if (mReadOptions.search) {
      aFilters.push(new Filter(Constants.field.programName, FilterOperator.Contains, mReadOptions.search));
    }

    if (mReadOptions.status) {
      aFilters.push(new Filter(Constants.field.status, FilterOperator.EQ, mReadOptions.status));
    }

    return this._readList(Constants.entitySet.analyses, {
      filters: aFilters,
      sorters: [new Sorter(Constants.field.createdAt, true)],
      length: mReadOptions.top || 20
    });
  };

  AnalysisService.prototype.readAnalysisSummary = function () {
    return Promise.all([
      this.countAnalyses(),
      this.countAnalysesByStatus("COMPLETED"),
      this.countAnalysesByStatus("WARNING"),
      this.countAnalysesByStatus("ERROR")
    ]).then(function (aResults) {
      return {
        total: aResults[0],
        completed: aResults[1],
        warning: aResults[2],
        error: aResults[3]
      };
    });
  };

  AnalysisService.prototype.countAnalyses = function (aFilters) {
    return this._oModel.bindList(
      Constants.entitySet.analyses,
      undefined,
      [],
      aFilters || [],
      { $count: true, $$ownRequest: true }
    ).requestContexts(0, 1).then(function (aContexts) {
      var oBinding = aContexts && aContexts[0] && aContexts[0].getBinding && aContexts[0].getBinding();
      return oBinding && typeof oBinding.getLength === "function" ? oBinding.getLength() : 0;
    });
  };

  AnalysisService.prototype.countAnalysesByStatus = function (sStatus) {
    return this.countAnalyses([new Filter(Constants.field.status, FilterOperator.EQ, sStatus)]);
  };

  AnalysisService.prototype.getAnalysisById = function (sAnalysisId) {
    return this._readContext(this._buildAnalysisPath(sAnalysisId), {
      $select: Constants.field.analyses.join(",")
    });
  };

  AnalysisService.prototype.getUiFilters = function (sAnalysisId) {
    return this._readNavigationList(sAnalysisId, Constants.navigation.uiFilters, {
      parameters: { $select: Constants.field.uiFilters.join(",") }
    });
  };

  AnalysisService.prototype.getDatabaseObjects = function (sAnalysisId) {
    return this._readNavigationList(sAnalysisId, Constants.navigation.databaseObjects, {
      parameters: { $select: Constants.field.databaseObjects.join(",") }
    });
  };

  AnalysisService.prototype.getBusinessLogic = function (sAnalysisId) {
    return this._readNavigationList(sAnalysisId, Constants.navigation.businessLogic, {
      parameters: { $select: Constants.field.businessLogic.join(",") }
    });
  };

  AnalysisService.prototype.getAlvOutputs = function (sAnalysisId) {
    return this._readNavigationList(sAnalysisId, Constants.navigation.alvOutputs, {
      parameters: { $select: Constants.field.alvOutputs.join(",") }
    });
  };

  AnalysisService.prototype.getEvidences = function (sAnalysisId) {
    return this._readNavigationList(sAnalysisId, Constants.navigation.evidences, {
      parameters: { $select: Constants.field.evidences.join(",") }
    });
  };

  AnalysisService.prototype.getRecommendations = function (sAnalysisId) {
    return this._readNavigationList(sAnalysisId, Constants.navigation.recommendations, {
      parameters: { $select: Constants.field.recommendations.join(",") }
    });
  };

  AnalysisService.prototype.getMessages = function (sAnalysisId) {
    return this._readNavigationList(sAnalysisId, Constants.navigation.messages, {
      parameters: { $select: Constants.field.messages.join(",") }
    });
  };

  AnalysisService.prototype.analyzeProgram = function (sProgramName) {
    var oActionBinding;

    if (!sProgramName) {
      return Promise.reject(new Error("ProgramName is required."));
    }

    oActionBinding = this._oModel.bindContext(Constants.action.analyzeBindingPath);
    oActionBinding.setParameter("ProgramName", sProgramName);

    return this._executeAction(oActionBinding);
  };

  AnalysisService.prototype._readNavigationList = function (sAnalysisId, sNavigation, mOptions) {
    var mReadOptions = Object.assign({
      length: 1000
    }, mOptions || {});

    return this._readList(this._buildAnalysisPath(sAnalysisId) + "/" + sNavigation, mReadOptions);
  };

  AnalysisService.prototype._executeAction = function (oActionBinding) {
    return oActionBinding.execute().then(function () {
      var oContext = oActionBinding.getBoundContext();
      return oContext ? oContext.requestObject() : {};
    });
  };

  AnalysisService.prototype._readContext = function (sPath, mParameters) {
    return this._oModel.bindContext(sPath, undefined, mParameters || {}).requestObject();
  };

  AnalysisService.prototype._readList = function (sPath, mOptions) {
    var mReadOptions = mOptions || {};
    var oListBinding = this._oModel.bindList(
      sPath,
      undefined,
      mReadOptions.sorters || [],
      mReadOptions.filters || [],
      mReadOptions.parameters || {}
    );

    return oListBinding.requestContexts(0, mReadOptions.length || 100).then(function (aContexts) {
      return aContexts.map(function (oContext) {
        return oContext.getObject();
      });
    });
  };

  AnalysisService.prototype._buildAnalysisPath = function (sAnalysisId) {
    var sId = String(sAnalysisId || "").trim();

    if (!sId) {
      throw new Error("AnalysisId is required.");
    }

    return Constants.entitySet.analyses + "(" + encodeURIComponent(sId) + ")";
  };

  return AnalysisService;
});
