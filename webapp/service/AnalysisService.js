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
      parameters: {
        $select: Constants.field.analyses.join(","),
        $$groupId: "$direct"
      },
      length: mReadOptions.top || 20
    });
  };

  AnalysisService.prototype.readAnalysisHistory = function (sProgramName, iTop) {
    var sValue = String(sProgramName || "").trim();

    if (!sValue) {
      return Promise.resolve([]);
    }

    return this._readList(Constants.entitySet.analyses, {
      filters: [new Filter(Constants.field.programName, FilterOperator.EQ, sValue)],
      sorters: [new Sorter(Constants.field.createdAt, true)],
      parameters: {
        $select: Constants.field.analyses.join(","),
        $$groupId: "$direct"
      },
      length: iTop || 50
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

  AnalysisService.prototype.deleteAnalysisById = function (sAnalysisId, sGroupId) {
    var oBinding = this._oModel.bindContext(this._buildAnalysisPath(sAnalysisId));
    var oContext = oBinding && oBinding.getBoundContext && oBinding.getBoundContext();

    if (!oContext || typeof oContext.delete !== "function") {
      return Promise.reject(new Error("Analysis delete context is not available."));
    }

    return oContext.delete(sGroupId || "$auto");
  };

  AnalysisService.prototype.deleteAnalysisContext = function (oContext, sGroupId) {
    if (!oContext || typeof oContext.delete !== "function") {
      return Promise.reject(new Error("Analysis delete context is not available."));
    }

    return Promise.resolve().then(function () {
      return oContext.delete(sGroupId || "$direct");
    });
  };

  AnalysisService.prototype.getUiFilters = function (sAnalysisId) {
    return this._readNavigationList(sAnalysisId, Constants.navigation.uiFilters, {
      parameters: { $select: Constants.field.uiFilters.join(",") }
    });
  };

  AnalysisService.prototype.getSourceObjects = function (sAnalysisId) {
    return this._readNavigationList(sAnalysisId, Constants.navigation.sourceObjects, {
      parameters: { $select: Constants.field.sourceObjects.join(",") },
      sorters: [new Sorter("ObjectName", false)]
    });
  };

  AnalysisService.prototype.getSourceLines = function (sAnalysisId, sSourceItemId, iLength) {
    return this._readList(this._buildSourceObjectPath(sAnalysisId, sSourceItemId) + "/" + Constants.navigation.sourceLines, {
      parameters: {
        $select: Constants.field.sourceLines.join(","),
        $$groupId: "$direct"
      },
      sorters: [new Sorter("LineNumber", false)],
      length: iLength || 10000
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

  AnalysisService.prototype.getBusinessLogicCallBindings = function (sAnalysisId, sItemId) {
    return this._readList(this._buildBusinessLogicPath(sAnalysisId, sItemId) + "/" + Constants.navigation.callBindings, {
      sorters: [new Sorter("BindingPosition", false)],
      parameters: {
        $select: Constants.field.callBindings.join(","),
        $$groupId: "$direct"
      },
      length: 1000
    });
  };

  AnalysisService.prototype.getAlvOutputs = function (sAnalysisId) {
    return this._readNavigationList(sAnalysisId, Constants.navigation.alvOutputs, {
      parameters: { $select: Constants.field.alvOutputs.join(",") }
    });
  };

  AnalysisService.prototype.getAlvOutputById = function (sAnalysisId, sOutputId) {
    return this._readContext(this._buildAlvOutputPath(sAnalysisId, sOutputId), {
      $select: Constants.field.alvOutputs.join(","),
      $$groupId: "$direct"
    });
  };

  AnalysisService.prototype.getAlvOutputChildren = function (sAnalysisId, sOutputId, sChildKey) {
    var mChild = {
      alvColumns: { nav: Constants.navigation.alvColumns, fields: Constants.field.alvColumns, sort: new Sorter("ColumnPosition", false) },
      alvSorts: { nav: Constants.navigation.alvSorts, fields: Constants.field.alvSorts, sort: new Sorter("SortPosition", false) },
      alvFilters: { nav: Constants.navigation.alvFilters, fields: Constants.field.alvFilters },
      alvEvents: { nav: Constants.navigation.alvEvents, fields: Constants.field.alvEvents }
    }[sChildKey];

    if (!mChild) {
      return Promise.reject(new Error("Unsupported ALV child table."));
    }

    return this._readList(this._buildAlvOutputPath(sAnalysisId, sOutputId) + "/" + mChild.nav, {
      sorters: mChild.sort ? [mChild.sort] : [],
      parameters: {
        $select: mChild.fields.join(","),
        $$groupId: "$direct"
      },
      length: 1000
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

  AnalysisService.prototype.getRecommendationById = function (sAnalysisId, sRecommendationId) {
    return this._readContext(this._buildRecommendationPath(sAnalysisId, sRecommendationId), {
      $select: Constants.field.recommendations.join(","),
      $$groupId: "$direct"
    });
  };

  AnalysisService.prototype.getRecommendationAnnotations = function (sAnalysisId, sRecommendationId) {
    return this._readList(this._buildRecommendationPath(sAnalysisId, sRecommendationId) + "/" + Constants.navigation.annotations, {
      sorters: [new Sorter("AnnotationSequence", false)],
      parameters: {
        $select: Constants.field.annotations.join(","),
        $$groupId: "$direct"
      },
      length: 1000
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

  AnalysisService.prototype.prepareFioriUi = function (sAnalysisId, mParameters) {
    var sId = String(sAnalysisId || "").trim();
    var sTargetPackage = String(mParameters && mParameters.targetPackage || "").trim();
    var sServiceRootUrl = String(mParameters && mParameters.serviceRootUrl || "").trim();
    var oActionBinding;

    if (!sId || !sTargetPackage || !sServiceRootUrl) {
      return Promise.reject(new Error("AnalysisId, TargetPackage and ServiceRootUrl are required."));
    }

    oActionBinding = this._oModel.bindContext(
      this._buildAnalysisPath(sId) + "/" + Constants.action.prepareFioriUiSuffix
    );
    oActionBinding.setParameter("TargetPackage", sTargetPackage);
    oActionBinding.setParameter("ServiceRootUrl", sServiceRootUrl);

    return oActionBinding.execute("$direct").then(function () {
      var oContext = oActionBinding.getBoundContext();
      return oContext ? oContext.requestObject() : {};
    });
  };

  AnalysisService.prototype.preflightOData = function (sAnalysisId, oParameters) {
    return this._executeODataGenerationAction(
      sAnalysisId,
      Constants.action.preflightODataSuffix,
      oParameters,
      ["TargetPackage", "ProviderPackage", "ProviderLanguage", "TransportRequest", "RequestId"]
    );
  };

  AnalysisService.prototype.generateOData = function (sAnalysisId, oParameters) {
    return this._executeODataGenerationAction(
      sAnalysisId,
      Constants.action.generateODataSuffix,
      oParameters,
      ["TargetPackage", "ProviderPackage", "ProviderLanguage", "TransportRequest", "RequestId"]
    );
  };

  AnalysisService.prototype.getODataGeneration = function (sAnalysisId, sRequestId) {
    return this._executeODataGenerationAction(
      sAnalysisId,
      Constants.action.getODataGenerationSuffix,
      { RequestId: String(sRequestId || "").trim() },
      ["RequestId"]
    );
  };

  AnalysisService.prototype._executeODataGenerationAction = function (sAnalysisId, sActionSuffix, oParameters, aNames) {
    var oActionBinding = this._oModel.bindContext(
      this._buildAnalysisPath(sAnalysisId) + "/" + sActionSuffix
    );

    aNames.forEach(function (sName) {
      oActionBinding.setParameter(sName, oParameters && oParameters[sName] || "");
    });

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

  AnalysisService.prototype._buildSourceObjectPath = function (sAnalysisId, sSourceItemId) {
    var sAnalysis = String(sAnalysisId || "").trim();
    var sSourceItem = String(sSourceItemId || "").trim();

    if (!sAnalysis || !sSourceItem) {
      throw new Error("AnalysisId and SourceItemId are required.");
    }

    return Constants.entitySet.sourceObjects + "(AnalysisId=" + encodeURIComponent(sAnalysis) + ",ItemId=" + encodeURIComponent(sSourceItem) + ")";
  };

  AnalysisService.prototype._buildAlvOutputPath = function (sAnalysisId, sOutputId) {
    var sAnalysis = String(sAnalysisId || "").trim();
    var sOutput = String(sOutputId || "").trim();

    if (!sAnalysis || !sOutput) {
      throw new Error("AnalysisId and OutputId are required.");
    }

    return Constants.entitySet.alvOutputs + "(AnalysisId=" + encodeURIComponent(sAnalysis) + ",OutputId=" + encodeURIComponent(sOutput) + ")";
  };

  AnalysisService.prototype._buildBusinessLogicPath = function (sAnalysisId, sItemId) {
    var sAnalysis = String(sAnalysisId || "").trim();
    var sItem = String(sItemId || "").trim();

    if (!sAnalysis || !sItem) {
      throw new Error("AnalysisId and ItemId are required.");
    }

    return Constants.entitySet.businessLogic + "(AnalysisId=" + encodeURIComponent(sAnalysis) + ",ItemId=" + encodeURIComponent(sItem) + ")";
  };

  AnalysisService.prototype._buildRecommendationPath = function (sAnalysisId, sRecommendationId) {
    var sAnalysis = String(sAnalysisId || "").trim();
    var sRecommendation = String(sRecommendationId || "").trim();

    if (!sAnalysis || !sRecommendation) {
      throw new Error("AnalysisId and RecommendationId are required.");
    }

    return Constants.entitySet.recommendations + "(AnalysisId=" + encodeURIComponent(sAnalysis) + ",RecommendationId=" + encodeURIComponent(sRecommendation) + ")";
  };

  return AnalysisService;
});
