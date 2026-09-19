sap.ui.define([], function () {
  "use strict";

  var ACTIVE = { QUEUED: true, DISPATCHING: true, SCHEDULED: true, RUNNING: true };

  function sameId(sLeft, sRight) {
    return String(sLeft || "").replace(/-/g, "").toLowerCase() ===
      String(sRight || "").replace(/-/g, "").toLowerCase();
  }

  function isActive(sStatus) {
    return !!ACTIVE[String(sStatus || "").toUpperCase()];
  }

  function normalize(oRow, sKind) {
    return {
      kind: sKind,
      requestId: String(oRow.RequestId || ""),
      analysisId: String(oRow.AnalysisId || ""),
      createdAt: oRow.CreatedAt || "",
      updatedAt: oRow.UpdatedAt || "",
      status: String(oRow.Status || ""),
      message: String(oRow.Message || ""),
      rowCount: sKind === "CAPTURE" && oRow.CountRow !== undefined && oRow.CountRow !== null ?
        oRow.CountRow : null,
      rowCountText: sKind === "CAPTURE" && oRow.CountRow !== undefined && oRow.CountRow !== null ?
        String(oRow.CountRow) : "-"
    };
  }

  function key(oRow) {
    return oRow.kind + ":" + String(oRow.requestId || "").toLowerCase();
  }

  function sort(aRows) {
    return aRows.sort(function (oLeft, oRight) {
      var iLeft = Date.parse(oLeft.createdAt) || 0;
      var iRight = Date.parse(oRight.createdAt) || 0;
      return iRight - iLeft || key(oRight).localeCompare(key(oLeft));
    });
  }

  function merge(aServerRows, aOptimisticRows) {
    var mRows = {};
    aOptimisticRows.forEach(function (oRow) { mRows[key(oRow)] = oRow; });
    aServerRows.forEach(function (oRow) { mRows[key(oRow)] = oRow; });
    return sort(Object.keys(mRows).map(function (sKey) { return mRows[sKey]; }));
  }

  function visible(aRows, sAnalysisId, sScope) {
    return sScope === "ALL" ? aRows : aRows.filter(function (oRow) {
      return sameId(oRow.analysisId, sAnalysisId);
    });
  }

  return Object.freeze({ isActive: isActive, normalize: normalize,
    key: key, merge: merge, visible: visible, sameId: sameId });
});
