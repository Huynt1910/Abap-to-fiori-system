sap.ui.define([], function () {
  "use strict";

  var aTechnicalFields = Object.freeze([
    "AnalysisId",
    "ItemId",
    "OutputId",
    "RecommendationId",
    "EvidenceId",
    "LayoutEvidenceId",
    "SourceItemId",
    "ExportId",
    "JobId",
    "RunId",
    "RecipientId",
    "CmpRunId",
    "ReportID",
    "RuleId",
    "StatementId",
    "__OperationControl",
    "__EntityControl",
    "__CreateByAssociationControl",
    "SAP__Messages",
    "Content",
    "SourceHash"
  ]);

  var mTechnicalFields = aTechnicalFields.reduce(function (mResult, sField) {
    mResult[sField] = true;
    return mResult;
  }, {});

  function isTechnical(sField) {
    return mTechnicalFields[String(sField || "")] === true;
  }

  return Object.freeze({
    list: aTechnicalFields,
    isTechnical: isTechnical
  });
});
