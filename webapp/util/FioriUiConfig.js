sap.ui.define([], function () {
  "use strict";

  function read(oObject, aNames) {
    if (!oObject || typeof oObject !== "object" || Array.isArray(oObject)) {
      return undefined;
    }
    var mKeys = Object.keys(oObject);
    var sKey = mKeys.find(function (sCandidate) {
      return aNames.some(function (sName) {
        return sCandidate.replace(/[^a-z0-9]/gi, "").toLowerCase() ===
          sName.replace(/[^a-z0-9]/gi, "").toLowerCase();
      });
    });
    return sKey ? oObject[sKey] : undefined;
  }

  function textValue(vValue) {
    return vValue === null || vValue === undefined ? "" : String(vValue);
  }

  function rows(vItems, aLabelKeys, aDetailKeys) {
    return (Array.isArray(vItems) ? vItems : []).map(function (vItem) {
      if (vItem === null || vItem === undefined) {
        return { label: "", detail: "" };
      }
      if (typeof vItem !== "object" || Array.isArray(vItem)) {
        return { label: textValue(vItem), detail: "" };
      }
      return {
        label: textValue(read(vItem, aLabelKeys)),
        detail: textValue(read(vItem, aDetailKeys))
      };
    });
  }

  function parse(oResponse) {
    var oConfig;
    try {
      oConfig = JSON.parse(oResponse && oResponse.ConfigJson);
    } catch (oError) {
      throw new Error("Invalid ConfigJson.");
    }
    if (!oConfig || typeof oConfig !== "object" || Array.isArray(oConfig)) {
      throw new Error("Invalid ConfigJson.");
    }

    var oSection = read(oConfig, ["ListReport", "ListReportConfig", "UiConfig", "Config"]);
    if (!oSection || typeof oSection !== "object" || Array.isArray(oSection)) {
      oSection = oConfig;
    }
    var aIssues = rows(read(oConfig, ["Issues"]) || read(oSection, ["Issues"]),
      ["Message", "IssueText", "Text", "Description", "Issue"], ["Severity", "Code", "Type"]);
    var iIssueCount = Number(oResponse && oResponse.IssueCount);

    return {
      status: textValue(oResponse && oResponse.Status),
      runtimeCheck: textValue(oResponse && oResponse.RuntimeCheck),
      prepareAnalysisId: textValue(read(oResponse, ["AnalysisId"])),
      configAnalysisId: textValue(read(oSection, ["analysisId"]) || read(oConfig, ["analysisId"])),
      config: oSection === oConfig ? oConfig : Object.assign({}, oConfig, oSection),
      issueCount: Number.isFinite(iIssueCount) ? iIssueCount : aIssues.length,
      entitySet: textValue(read(oSection, ["EntitySet", "EntitySetName"]) || read(oConfig, ["EntitySet", "EntitySetName"])),
      issues: aIssues,
      columns: rows(read(oSection, ["Columns"]) || read(oConfig, ["Columns"]),
        ["FieldName", "PropertyName", "Property", "ColumnName", "Field", "Name", "Key", "Column"], ["Label", "Title", "Description"]),
      filters: rows(read(oSection, ["Filters"]) || read(oConfig, ["Filters"]),
        ["FieldName", "PropertyName", "Property", "Field", "Name", "Key", "Filter"], ["Label", "Title", "Description"])
    };
  }

  return { parse: parse };
});
