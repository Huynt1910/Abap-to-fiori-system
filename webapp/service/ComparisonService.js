sap.ui.define([
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/model/Sorter",
  "abap/to/fiori/system/model/ComparisonConstants"
], function (Filter, FilterOperator, Sorter, ComparisonConstants) {
  "use strict";

  function ComparisonService(oComparisonModel, mOptions) {
    this._oModel = oComparisonModel;
    this._mOptions = mOptions || {};
    this._bCancelled = false;
    this._iPollToken = 0;
  }

  /**
   * Executes the collection-bound comparison action for one analysis.
   * @param {string} sAnalysisId Analysis UUID
   * @returns {Promise<object>} Action bound-context object, empty for 204 responses
   */
  ComparisonService.prototype.executeComparison = function (sAnalysisId) {
    var sId = this.normalizeGuid(sAnalysisId);
    var oAction;

    if (!this.isGuid(sId)) {
      return Promise.reject(new Error("Valid AnalysisId is required."));
    }

    oAction = this._oModel.bindContext(ComparisonConstants.action.executeComparison);
    oAction.setParameter(ComparisonConstants.field.analysisId, sId);

    return oAction.execute("$direct").then(function () {
      var oContext = oAction.getBoundContext && oAction.getBoundContext();
      return oContext && oContext.requestObject ? oContext.requestObject() : {};
    });
  };

  /**
   * Reads comparison runs with server-side filters and CreatedAt descending sort.
   * @param {object} mOptions Filter and paging options
   * @returns {Promise<object[]>} Comparison run objects
   */
  ComparisonService.prototype.getComparisonRuns = function (mOptions) {
    var mReadOptions = mOptions || {};
    var aFilters = this._buildRunFilters(mReadOptions.filters || {});

    return this._readList(ComparisonConstants.entitySet.runs, {
      filters: aFilters,
      sorters: [new Sorter(ComparisonConstants.field.createdAt, true)],
      parameters: {
        $select: ComparisonConstants.field.runs.join(","),
        $$groupId: "$direct"
      },
      length: mReadOptions.top || 50
    });
  };

  /**
   * Reads one comparison run by CmpRunId.
   * @param {string} sCmpRunId Comparison run UUID
   * @returns {Promise<object>} Comparison run
   */
  ComparisonService.prototype.getComparisonRunById = function (sCmpRunId) {
    var sId = this.normalizeGuid(sCmpRunId);

    if (!this.isGuid(sId)) {
      return Promise.reject(new Error("Valid CmpRunId is required."));
    }

    return this._readContext(this._buildRunPath(sId), {
      $select: ComparisonConstants.field.runs.join(","),
      $$groupId: "$direct"
    });
  };

  /**
   * Reads comparison items for a run.
   * @param {string} sCmpRunId Comparison run UUID
   * @param {object} mFilters Optional Category/Status/Severity filters
   * @returns {Promise<object[]>} Comparison items
   */
  ComparisonService.prototype.getComparisonItems = function (sCmpRunId, mFilters) {
    var sId = this.normalizeGuid(sCmpRunId);
    var aFilters;

    if (!this.isGuid(sId)) {
      return Promise.reject(new Error("Valid CmpRunId is required."));
    }

    aFilters = [new Filter(ComparisonConstants.field.runId, FilterOperator.EQ, sId)]
      .concat(this._buildItemFilters(mFilters || {}));

    return this._readList(ComparisonConstants.entitySet.items, {
      filters: aFilters,
      sorters: [new Sorter("ItemNo", false)],
      parameters: {
        $select: ComparisonConstants.field.items.join(","),
        $$groupId: "$direct"
      },
      length: 1000
    });
  };

  /**
   * Finds the new run created by ExecuteComparison.
   * @param {string} sAnalysisId Analysis UUID
   * @param {string[]} aPreviousRunIds Known run IDs before action execution
   * @param {number} iStartedAt Client timestamp before action execution
   * @returns {Promise<object>} Newly discovered comparison run
   */
  ComparisonService.prototype.discoverNewRun = function (sAnalysisId, aPreviousRunIds, iStartedAt) {
    var sId = this.normalizeGuid(sAnalysisId);
    var mPrevious = {};
    var iTimeout = this._mOptions.discoveryTimeoutMs || ComparisonConstants.polling.timeoutMs;
    var iInterval = this._mOptions.discoveryIntervalMs || ComparisonConstants.polling.intervalMs;
    var iStarted = Date.now();

    (aPreviousRunIds || []).forEach(function (sRunId) {
      mPrevious[String(sRunId).toLowerCase()] = true;
    });

    return this._pollUntil(function () {
      return this.getComparisonRuns({
        top: 5,
        filters: { analysisId: sId }
      }).then(function (aRuns) {
        return this._findNewRun(aRuns, mPrevious, sId, iStartedAt);
      }.bind(this));
    }.bind(this), iInterval, iTimeout, iStarted, "Could not identify the newly created comparison run.");
  };

  /**
   * Polls a comparison run until it reaches a terminal status.
   * @param {string} sCmpRunId Comparison run UUID
   * @returns {Promise<object>} Terminal comparison run
   */
  ComparisonService.prototype.pollRunStatus = function (sCmpRunId) {
    var iTimeout = this._mOptions.statusTimeoutMs || ComparisonConstants.polling.timeoutMs;
    var iInterval = this._mOptions.statusIntervalMs || ComparisonConstants.polling.intervalMs;
    var iStarted = Date.now();

    return this._pollUntil(function () {
      return this.getComparisonRunById(sCmpRunId).then(function (oRun) {
        return this.isTerminalRun(oRun) ? oRun : null;
      }.bind(this));
    }.bind(this), iInterval, iTimeout, iStarted, "Comparison is still running. Please refresh the result later.");
  };

  ComparisonService.prototype.cancelPolling = function () {
    this._bCancelled = true;
    this._iPollToken += 1;
  };

  ComparisonService.prototype.resetCancellation = function () {
    this._bCancelled = false;
  };

  ComparisonService.prototype.isGuid = function (sValue) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(sValue || "").trim());
  };

  ComparisonService.prototype.normalizeGuid = function (sValue) {
    return String(sValue || "").trim();
  };

  ComparisonService.prototype.isTerminalRun = function (oRun) {
    var sStatus = String(oRun && oRun.RunStatus || "").toUpperCase();
    return this.isCompletedStatus(sStatus) || this.isFailedStatus(sStatus);
  };

  ComparisonService.prototype.isCompletedStatus = function (sStatus) {
    var sValue = String(sStatus || "").toUpperCase();
    return sValue === ComparisonConstants.runStatus.completed || sValue === ComparisonConstants.runStatus.success;
  };

  ComparisonService.prototype.isFailedStatus = function (sStatus) {
    var sValue = String(sStatus || "").toUpperCase();
    return sValue === ComparisonConstants.runStatus.failed || sValue === ComparisonConstants.runStatus.error;
  };

  ComparisonService.prototype._findNewRun = function (aRuns, mPrevious, sAnalysisId, iStartedAt) {
    var iStarted = Number(iStartedAt || 0);

    return (aRuns || []).find(function (oRun) {
      var sRunId = String(oRun && oRun.CmpRunId || "").toLowerCase();
      var sRunAnalysisId = this.normalizeGuid(oRun && oRun.AnalysisId);
      var iCreatedAt = oRun && oRun.CreatedAt ? new Date(oRun.CreatedAt).getTime() : 0;

      return sRunId &&
        !mPrevious[sRunId] &&
        sRunAnalysisId.toLowerCase() === sAnalysisId.toLowerCase() &&
        (!iStarted || !iCreatedAt || iCreatedAt >= iStarted - 5000);
    }.bind(this)) || null;
  };

  ComparisonService.prototype._pollUntil = function (fnCheck, iInterval, iTimeout, iStartedAt, sTimeoutMessage) {
    var iToken = ++this._iPollToken;
    var fnSleep = this._mOptions.sleep || function (iMs) {
      return new Promise(function (resolve) {
        setTimeout(resolve, iMs);
      });
    };

    this._bCancelled = false;

    function loop() {
      if (this._bCancelled || iToken !== this._iPollToken) {
        return Promise.reject(new Error("Comparison polling was cancelled."));
      }
      if (Date.now() - iStartedAt > iTimeout) {
        return Promise.reject(new Error(sTimeoutMessage));
      }
      return fnCheck().then(function (vResult) {
        if (vResult) {
          return vResult;
        }
        return fnSleep(iInterval).then(loop.bind(this));
      }.bind(this));
    }

    return loop.call(this);
  };

  ComparisonService.prototype._buildRunFilters = function (mFilters) {
    var aFilters = [];

    this._addFilterIfFilled(aFilters, ComparisonConstants.field.analysisId, mFilters.analysisId);
    this._addFilterIfFilled(aFilters, ComparisonConstants.field.programName, mFilters.programName);
    this._addFilterIfFilled(aFilters, ComparisonConstants.field.targetStrategy, mFilters.targetStrategy);
    this._addFilterIfFilled(aFilters, ComparisonConstants.field.overallStatus, mFilters.overallStatus);
    this._addFilterIfFilled(aFilters, ComparisonConstants.field.runStatus, mFilters.runStatus);

    return aFilters;
  };

  ComparisonService.prototype._buildItemFilters = function (mFilters) {
    var aFilters = [];

    this._addFilterIfFilled(aFilters, "Category", mFilters.category);
    this._addFilterIfFilled(aFilters, "Status", mFilters.status);
    this._addFilterIfFilled(aFilters, "Severity", mFilters.severity);

    return aFilters;
  };

  ComparisonService.prototype._addFilterIfFilled = function (aFilters, sField, vValue) {
    var sValue = String(vValue || "").trim();
    if (sValue) {
      aFilters.push(new Filter(sField, FilterOperator.EQ, sValue));
    }
  };

  ComparisonService.prototype._readContext = function (sPath, mParameters) {
    return this._oModel.bindContext(sPath, undefined, mParameters || {}).requestObject();
  };

  ComparisonService.prototype._readList = function (sPath, mOptions) {
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

  ComparisonService.prototype._buildRunPath = function (sCmpRunId) {
    return ComparisonConstants.entitySet.runs + "(" + encodeURIComponent(sCmpRunId) + ")";
  };

  return ComparisonService;
});
