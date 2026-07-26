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

  /**
   * Reads latest analysis headers.
   * @param {object} [mOptions] Read options.
   * @returns {Promise<object[]>} Analysis rows.
   */
  AnalysisService.prototype.getLatestAnalyses = function (mOptions) {
    var mReadOptions = mOptions || {};
    var aFilters = [];

    if (mReadOptions.latestOnly !== false) {
      aFilters.push(new Filter(Constants.field.isLatest, FilterOperator.EQ, true));
    }

    if (mReadOptions.search) {
      aFilters.push(new Filter(Constants.field.rootProgram, FilterOperator.Contains, mReadOptions.search));
    }

    if (mReadOptions.status) {
      aFilters.push(new Filter("AnalysisStatus", FilterOperator.EQ, mReadOptions.status));
    }

    return this._readList(Constants.entitySet.analysis, {
      filters: aFilters,
      sorters: [new Sorter(Constants.field.createdAt, true)],
      length: mReadOptions.top || 20
    });
  };

  /**
   * Reads one Analysis by ID and expands Summary for the overview.
   * @param {string} sAnalysisId Analysis GUID.
   * @returns {Promise<object>} Analysis with optional summary.
   */
  AnalysisService.prototype.getAnalysisById = function (sAnalysisId) {
    return this._readContext(this._buildAnalysisPath(sAnalysisId), {
      $expand: [
        Constants.association.summary,
        Constants.association.complexity + "($select=AnalysisId,RootProgram,SourceScore,DatabaseScore,CallScore,RoutineScore,FlowScore,IssueScore,OverallScore,ComplexityLevel,ScoringVersion,AssessedAt)"
      ].join(",")
    });
  };

  /**
   * Reads complexity assessment for one analysis.
   * @param {string} sAnalysisId Analysis GUID.
   * @returns {Promise<object|null>} Complexity assessment or null.
   */
  AnalysisService.prototype.getComplexity = function (sAnalysisId) {
    return this._readNavigationObject(sAnalysisId, Constants.association.complexity, {
      $select: [
        "AnalysisId",
        "RootProgram",
        "SourceScore",
        "DatabaseScore",
        "CallScore",
        "RoutineScore",
        "FlowScore",
        "IssueScore",
        "OverallScore",
        "ComplexityLevel",
        "ScoringVersion",
        "AssessedAt"
      ].join(",")
    });
  };

  /**
   * Reads migration recommendations for one analysis.
   * @param {string} sAnalysisId Analysis GUID.
   * @returns {Promise<object[]>} Recommendation rows.
   */
  AnalysisService.prototype.getRecommendations = function (sAnalysisId) {
    return this._readNavigationList(sAnalysisId, Constants.association.recommendations, {
      parameters: {
        $select: [
          "AnalysisId",
          "RecommendationNo",
          "RootProgram",
          "RecommendationCode",
          "Category",
          "Priority",
          "Title",
          "Description",
          "Evidence",
          "GeneratedAt"
        ].join(",")
      },
      sorters: [new Sorter("RecommendationNo", false)],
      length: 1000
    });
  };

  /**
   * Reads the summary for one analysis.
   * @param {string} sAnalysisId Analysis GUID.
   * @returns {Promise<object|null>} Summary row.
   */
  AnalysisService.prototype.getSummary = function (sAnalysisId) {
    return this._readNavigationObject(sAnalysisId, Constants.association.summary);
  };

  /**
   * Reads issues for one analysis.
   * @param {string} sAnalysisId Analysis GUID.
   * @returns {Promise<object[]>} Issue rows.
   */
  AnalysisService.prototype.getIssues = function (sAnalysisId) {
    return this._readNavigationList(sAnalysisId, Constants.association.issues);
  };

  /**
   * Reads database accesses and references for one analysis.
   * @param {string} sAnalysisId Analysis GUID.
   * @returns {Promise<object>} Database details.
   */
  AnalysisService.prototype.getDatabaseDetails = function (sAnalysisId) {
    return this._readExpandedAnalysis(sAnalysisId, [
      Constants.association.databaseAccesses,
      Constants.association.databaseReferences
    ]).then(function (oAnalysis) {
      return {
        databaseAccesses: this._extractCollection(oAnalysis, Constants.association.databaseAccesses),
        databaseReferences: this._extractCollection(oAnalysis, Constants.association.databaseReferences)
      };
    }.bind(this));
  };

  /**
   * Reads calls, routines and scopes for one analysis.
   * @param {string} sAnalysisId Analysis GUID.
   * @returns {Promise<object>} Business logic details.
   */
  AnalysisService.prototype.getBusinessLogic = function (sAnalysisId) {
    return this._readExpandedAnalysis(sAnalysisId, [
      Constants.association.calls,
      Constants.association.routines,
      Constants.association.scopes
    ]).then(function (oAnalysis) {
      return {
        calls: this._extractCollection(oAnalysis, Constants.association.calls),
        routines: this._extractCollection(oAnalysis, Constants.association.routines),
        scopes: this._extractCollection(oAnalysis, Constants.association.scopes)
      };
    }.bind(this));
  };

  /**
   * Reads graph nodes and edges for one analysis.
   * @param {string} sAnalysisId Analysis GUID.
   * @returns {Promise<object>} Graph details.
   */
  AnalysisService.prototype.getGraph = function (sAnalysisId) {
    return this._readExpandedAnalysis(sAnalysisId, [
      Constants.association.nodes,
      Constants.association.edges
    ]).then(function (oAnalysis) {
      return {
        nodes: this._extractCollection(oAnalysis, Constants.association.nodes),
        edges: this._extractCollection(oAnalysis, Constants.association.edges)
      };
    }.bind(this));
  };

  /**
   * Reads all analysis runs for the same root program.
   * @param {string} sRootProgram Root ABAP program.
   * @returns {Promise<object[]>} History rows.
   */
  AnalysisService.prototype.getHistory = function (sRootProgram) {
    if (!sRootProgram) {
      return Promise.resolve([]);
    }

    return this._readList(Constants.entitySet.analysis, {
      filters: [new Filter(Constants.field.rootProgram, FilterOperator.EQ, sRootProgram)],
      sorters: [new Sorter("RunNo", true)],
      length: 100
    });
  };

  /**
   * Executes the collection-bound RunAnalysis action.
   * @param {string} sRootProgram Root ABAP program.
   * @param {string} sProgramDescription Analysis description.
   * @returns {Promise<object>} Created analysis.
   */
  AnalysisService.prototype.runAnalysis = function (sRootProgram, sProgramDescription) {
    var oActionBinding;

    if (!sRootProgram) {
      return Promise.reject(new Error("RootProgram is required."));
    }

    if (!sProgramDescription) {
      return Promise.reject(new Error("ProgramDescription is required."));
    }

    oActionBinding = this._oModel.bindContext(
      Constants.entitySet.analysis + "/" + Constants.action.runAnalysis + "(...)"
    );
    oActionBinding.setParameter("RootProgram", sRootProgram);
    oActionBinding.setParameter("ProgramDescription", sProgramDescription);

    return this._executeAction(oActionBinding);
  };

  /**
   * Executes the instance-bound Reanalyze action.
   * @param {string} sAnalysisId Analysis GUID.
   * @returns {Promise<object>} New analysis result.
   */
  AnalysisService.prototype.reanalyze = function (sAnalysisId) {
    return this._executeInstanceAction(sAnalysisId, Constants.action.reanalyze);
  };

  AnalysisService.prototype._readExpandedAnalysis = function (sAnalysisId, aAssociations) {
    return this._readContext(this._buildAnalysisPath(sAnalysisId), {
      $expand: aAssociations.join(",")
    });
  };

  AnalysisService.prototype._readNavigationObject = function (sAnalysisId, sAssociation, mParameters) {
    return this._readContext(this._buildAnalysisPath(sAnalysisId) + "/" + sAssociation, mParameters).catch(function (oError) {
      if (oError && oError.status === 404) {
        return null;
      }
      throw oError;
    });
  };

  AnalysisService.prototype._readNavigationList = function (sAnalysisId, sAssociation, mOptions) {
    var mReadOptions = Object.assign({
      length: 1000
    }, mOptions || {});

    return this._readList(this._buildAnalysisPath(sAnalysisId) + "/" + sAssociation, mReadOptions);
  };

  AnalysisService.prototype._executeInstanceAction = function (sAnalysisId, sActionName) {
    var oActionBinding = this._oModel.bindContext(
      this._buildAnalysisPath(sAnalysisId) + "/" + sActionName + "(...)"
    );
    return this._executeAction(oActionBinding);
  };

  AnalysisService.prototype._executeAction = function (oActionBinding) {
    return oActionBinding.execute().then(function () {
      var oContext = oActionBinding.getBoundContext();
      return oContext ? oContext.requestObject() : {};
    });
  };

  AnalysisService.prototype._readContext = function (sPath, mParameters) {
    var oContextBinding = this._oModel.bindContext(sPath, undefined, mParameters || {});
    return oContextBinding.requestObject();
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

    return Constants.entitySet.analysis + "(" + encodeURIComponent(sId) + ")";
  };

  AnalysisService.prototype._extractCollection = function (oEntity, sAssociation) {
    var vValue = oEntity && oEntity[sAssociation];

    if (Array.isArray(vValue)) {
      return vValue;
    }

    if (vValue && Array.isArray(vValue.value)) {
      return vValue.value;
    }

    return [];
  };

  return AnalysisService;
});
