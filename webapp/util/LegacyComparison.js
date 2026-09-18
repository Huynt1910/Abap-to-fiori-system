sap.ui.define([], function () {
  "use strict";

  function objectJson(sText, sLabel) {
    var oValue;
    try { oValue = JSON.parse(String(sText || "")); } catch (oError) {
      throw new Error(sLabel + " must be valid JSON.");
    }
    if (!oValue || typeof oValue !== "object" || Array.isArray(oValue)) {
      throw new Error(sLabel + " must be a JSON object.");
    }
    return oValue;
  }

  function selections(sText) {
    var aValue;
    try { aValue = JSON.parse(String(sText || "")); } catch (oError) {
      throw new Error("SelectionJson must be valid JSON.");
    }
    if (!Array.isArray(aValue) || aValue.some(function (oItem) {
      return !oItem || typeof oItem !== "object" || Array.isArray(oItem);
    })) {
      throw new Error("SelectionJson must be an array of selection objects; use [] for all rows.");
    }
    return aValue;
  }

  function selectionValue(oItem, aNames) {
    var sKey = Object.keys(oItem).find(function (sCandidate) {
      return aNames.some(function (sName) { return sCandidate.toLowerCase() === sName.toLowerCase(); });
    });
    return sKey === undefined ? undefined : oItem[sKey];
  }

  function filterValues(aSelections) {
    var oValues = {};
    aSelections.forEach(function (oItem, iIndex) {
      var aAllowed = ["FieldName", "SelName", "ParameterName", "Name", "Sign", "FilterSign",
        "Option", "FilterOption", "Low", "LowValue", "Value", "High", "HighValue"];
      if (Object.keys(oItem).some(function (sKey) {
        return !aAllowed.some(function (sAllowed) { return sAllowed.toLowerCase() === sKey.toLowerCase(); });
      })) {
        throw new Error("SelectionJson item " + (iIndex + 1) + " has fields with unknown filter semantics.");
      }
      var sName = selectionValue(oItem, ["FieldName", "SelName", "ParameterName", "Name"]);
      var sSign = selectionValue(oItem, ["Sign", "FilterSign"]);
      var sOption = selectionValue(oItem, ["Option", "FilterOption"]);
      var vLow = selectionValue(oItem, ["Low", "LowValue", "Value"]);
      var vHigh = selectionValue(oItem, ["High", "HighValue"]);
      if (typeof sName !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(sName)) {
        throw new Error("SelectionJson item " + (iIndex + 1) + " has no supported parameter name.");
      }
      if (sSign !== "I" || sOption !== "EQ" ||
          (vHigh !== undefined && vHigh !== null && vHigh !== "") ||
          vLow === undefined || vLow === null ||
          (typeof vLow !== "string" && typeof vLow !== "number" && typeof vLow !== "boolean")) {
        throw new Error("SelectionJson item " + (iIndex + 1) + " cannot map to a scalar include/EQ OData filter.");
      }
      if (Object.prototype.hasOwnProperty.call(oValues, sName)) {
        throw new Error("SelectionJson has multiple values for parameter " + sName + ".");
      }
      oValues[sName] = vLow;
    });
    return oValues;
  }

  function mapping(sText, sLabel) {
    var oValue = objectJson(sText, sLabel);
    Object.keys(oValue).forEach(function (sKey) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(sKey) ||
          !/^[A-Za-z_][A-Za-z0-9_]*$/.test(oValue[sKey])) {
        throw new Error(sLabel + " contains an invalid field name: " + sKey + ".");
      }
    });
    return oValue;
  }

  function resolveColumns(aRows, oConfigured, oTypes, bRequireAll) {
    var oColumns = {};
    var aProperties = Object.keys(oTypes);
    var aMissing = [];
    var aOmitted = [];
    function normalized(sName) {
      return sName.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
    }
    var aFields = Array.from(new Set(aRows.reduce(function (aNames, oRow) {
      return aNames.concat(Object.keys(oRow));
    }, [])));
    aFields.forEach(function (sField) {
      var sTarget = oConfigured[sField];
      if (sTarget && Object.prototype.hasOwnProperty.call(oTypes, sTarget)) {
        oColumns[sField] = sTarget;
        return;
      }
      if (Object.prototype.hasOwnProperty.call(oTypes, sField)) {
        oColumns[sField] = sField;
        return;
      }
      if (sTarget) {
        var aConfiguredMatches = aProperties.filter(function (sProperty) {
          return normalized(sProperty) === normalized(sTarget);
        });
        if (aConfiguredMatches.length === 1) {
          oColumns[sField] = aConfiguredMatches[0];
          return;
        }
      }
      var sNormalized = normalized(sField);
      var aMatches = aProperties.filter(function (sProperty) {
        return normalized(sProperty) === sNormalized;
      });
      if (aMatches.length === 1) {
        oColumns[sField] = aMatches[0];
        return;
      }
      if (aMatches.length > 1) {
        throw new Error("ALV column " + sField + " matches multiple OData properties: " +
          aMatches.join(", ") + ". Configure an explicit ALV-to-OData mapping.");
      }
      aOmitted.push(sField);
      aMissing.push(sField + (sTarget ? " (configured as " + sTarget + ")" : ""));
    });
    if (bRequireAll && aMissing.length) {
      throw new Error("ALV column" + (aMissing.length === 1 ? " " : "s ") +
        aMissing.join(", ") + " ha" + (aMissing.length === 1 ? "s" : "ve") +
        " no matching OData propert" + (aMissing.length === 1 ? "y" : "ies") +
        ". Entity properties: " + (aProperties.join(", ") || "(none)") +
        ". Add the missing properties to the generated service or configure their ALV-to-OData mappings.");
    }
    if (!Object.keys(oColumns).length) {
      throw new Error("No captured ALV columns match the generated OData properties.");
    }
    return { columns: oColumns, omittedColumns: aOmitted, capturedColumnCount: aFields.length,
      unmatchedProperties: aProperties.filter(function (sProperty) {
        return Object.keys(oColumns).every(function (sAlv) { return oColumns[sAlv] !== sProperty; });
      }) };
  }

  function completeColumns(aRows, oConfigured, oTypes) {
    return resolveColumns(aRows, oConfigured, oTypes, true).columns;
  }

  function projectedColumns(aRows, oConfigured, oTypes) {
    var oResolved = resolveColumns(aRows, oConfigured, oTypes, false);
    var oSources = {};
    Object.keys(oResolved.columns).forEach(function (sAlv) {
      var sTarget = oResolved.columns[sAlv];
      if (Object.prototype.hasOwnProperty.call(oSources, sTarget)) {
        throw new Error("ALV columns " + oSources[sTarget] + " and " + sAlv +
          " both map to OData property " + sTarget + ". Remove the conflicting override.");
      }
      oSources[sTarget] = sAlv;
    });
    return oResolved;
  }

  function schemaDifferences(oProjection) {
    return oProjection.unmatchedProperties.map(function (sProperty) {
      return { kind: "ALV_COLUMN_MISSING", key: "", column: sProperty,
        alv: "column missing", odata: "property present" };
    });
  }

  function mappingLog(oColumns, aKeys, oFilters, oParameters) {
    var aFilters = Object.keys(oParameters).map(function (sParameter) {
      return { kind: "FILTER", source: sParameter, target: oFilters[sParameter], isKey: false };
    });
    if (!aFilters.length) {
      aFilters.push({ kind: "NO_FILTER", source: "[]", target: "", isKey: false });
    }
    return aFilters.concat(Object.keys(oColumns).map(function (sAlv) {
      return { kind: "COLUMN", source: sAlv, target: oColumns[sAlv],
        isKey: aKeys.indexOf(sAlv) !== -1 };
    }));
  }

  function keys(sText, oColumns) {
    var aKeys;
    try { aKeys = JSON.parse(String(sText || "")); } catch (oError) {
      throw new Error("Business keys must be a JSON array of ALV column names.");
    }
    if (!Array.isArray(aKeys) || !aKeys.length ||
        aKeys.some(function (sKey) { return typeof sKey !== "string" || !oColumns[sKey]; }) ||
        new Set(aKeys).size !== aKeys.length) {
      throw new Error("Business keys must be distinct mapped ALV columns.");
    }
    return aKeys;
  }

  function metadataKeys(oColumns, aEntityKeys) {
    var aNames = Object.keys(oColumns);
    var aKeys = (aEntityKeys || []).map(function (sTarget) {
      return aNames.find(function (sAlv) { return oColumns[sAlv] === sTarget; });
    });
    return aKeys.every(Boolean) ? aKeys : [];
  }

  function capture(oResponse, sAnalysisId, sRequestId) {
    if (!oResponse || String(oResponse.AnalysisId || "").toLowerCase() !== String(sAnalysisId).toLowerCase() ||
        String(oResponse.RequestId || "").toLowerCase() !== String(sRequestId).toLowerCase()) {
      throw new Error("Capture response does not match AnalysisId and RequestId.");
    }
    if (oResponse.Status !== "CAPTURED") {
      var sStatus = oResponse.Status || "unknown";
      throw new Error("Capture status is " + sStatus + (oResponse.Message ? ": " + oResponse.Message :
        (sStatus === "QUEUED" || sStatus === "DISPATCHING" || sStatus === "SCHEDULED" || sStatus === "RUNNING" ?
          "; waiting for the scheduled SAP background job." : ".")));
    }
    var aRows;
    try { aRows = JSON.parse(oResponse.RowsJson); } catch (oError) {
      throw new Error("RowsJson is not valid JSON.");
    }
    if (!Array.isArray(aRows) || aRows.some(function (oRow) {
      return !oRow || typeof oRow !== "object" || Array.isArray(oRow);
    })) {
      throw new Error("RowsJson must be an array of row objects.");
    }
    var nCount = Number(oResponse.CountRow);
    if (!Number.isSafeInteger(nCount) || nCount < 0 || nCount !== aRows.length) {
      throw new Error("CountRow does not match the number of rows in RowsJson.");
    }
    return { rows: aRows, count: nCount };
  }

  function decimal(vValue) {
    var sValue = typeof vValue === "string" ? vValue :
      (typeof vValue === "number" && Number.isFinite(vValue) &&
        Number.isSafeInteger(vValue) ? String(vValue) : null);
    if (sValue === null || !/^[+-]?\d+(?:\.\d+)?$/.test(sValue)) {
      throw new Error("Decimal is not an exact decimal string or safe integer.");
    }
    var bNegative = sValue[0] === "-";
    sValue = sValue.replace(/^[+-]/, "");
    var aParts = sValue.split(".");
    var sWhole = aParts[0].replace(/^0+(?=\d)/, "");
    var sFraction = (aParts[1] || "").replace(/0+$/, "");
    return (bNegative && (sWhole !== "0" || sFraction) ? "-" : "") + sWhole +
      (sFraction ? "." + sFraction : "");
  }

  function dateTime(vValue) {
    if (typeof vValue !== "string") { throw new Error("DateTimeOffset must be an ISO string."); }
    var aMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/.exec(vValue);
    if (!aMatch) { throw new Error("DateTimeOffset must include a timezone offset."); }
    var iBase = Date.parse(aMatch[1] + "T" + aMatch[2] + aMatch[4]);
    if (!validDate(aMatch[1]) || Number(aMatch[2].slice(0, 2)) > 23 ||
        Number(aMatch[2].slice(3, 5)) > 59 || Number(aMatch[2].slice(6, 8)) > 59 ||
        !Number.isFinite(iBase)) {
      throw new Error("Invalid DateTimeOffset.");
    }
    return String(iBase) + ":" + (aMatch[3] || "").replace(/0+$/, "");
  }

  function validDate(sValue) {
    var aParts = sValue.split("-").map(Number);
    var oDate = new Date(0);
    oDate.setUTCFullYear(aParts[0], aParts[1] - 1, aParts[2]);
    return oDate.getUTCFullYear() === aParts[0] && oDate.getUTCMonth() === aParts[1] - 1 &&
      oDate.getUTCDate() === aParts[2];
  }

  function canonical(vValue, sType) {
    if (vValue === null) { return "null"; }
    if (vValue === undefined) { throw new Error("Missing value."); }
    if (sType === "Edm.String" || sType === "Edm.Guid") {
      if (typeof vValue !== "string") { throw new Error(sType + " must be a string."); }
      if (sType === "Edm.Guid" &&
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(vValue)) {
        throw new Error("Guid must be a valid UUID.");
      }
      return "s:" + vValue;
    }
    if (sType === "Edm.Decimal" || /^Edm\.(?:Int\d+|Byte|SByte)$/.test(sType)) {
      var sDecimal = decimal(vValue);
      if (sType !== "Edm.Decimal" && sDecimal.indexOf(".") >= 0) {
        throw new Error(sType + " must be an integer.");
      }
      return "n:" + sDecimal;
    }
    if (sType === "Edm.Boolean") {
      if (typeof vValue !== "boolean") { throw new Error("Boolean must be true or false."); }
      return "b:" + vValue;
    }
    if (sType === "Edm.Date") {
      if (typeof vValue !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(vValue) ||
          !validDate(vValue)) {
        throw new Error("Date must be YYYY-MM-DD.");
      }
      return "d:" + vValue;
    }
    if (sType === "Edm.DateTimeOffset") { return "t:" + dateTime(vValue); }
    throw new Error("Unsupported EDM type " + sType + ".");
  }

  function compare(aAlv, aOData, oColumns, aKeys, oTypes) {
    var aNames = Object.keys(oColumns);
    if (!aNames.length) { throw new Error("No ALV to OData columns are mapped."); }
    var aTargets = aNames.map(function (sName) { return oColumns[sName]; });
    if (new Set(aTargets).size !== aTargets.length) {
      throw new Error("Multiple ALV columns map to the same OData column.");
    }
    aTargets.forEach(function (sName) {
      if (!oTypes[sName]) { throw new Error("OData column " + sName + " is missing from metadata."); }
    });
    if (!aKeys.length) {
      // Without mapped entity keys, compare full rows as a multiset so duplicates count.
      function fullRows(aRows, sSide) {
        var oIndex = new Map();
        aRows.forEach(function (oRow, iRow) {
          var aValues = aNames.map(function (sAlv) {
            var sField = sSide === "ALV" ? sAlv : oColumns[sAlv];
            if (!Object.prototype.hasOwnProperty.call(oRow, sField)) {
              throw new Error(sSide + " row " + (iRow + 1) + " is missing column " + sField + ".");
            }
            try { return canonical(oRow[sField], oTypes[oColumns[sAlv]]); }
            catch (oError) {
              throw new Error(sSide + " row " + (iRow + 1) + ", column " + sField + ": " + oError.message);
            }
          });
          var sKey = JSON.stringify(aValues);
          var oEntry = oIndex.get(sKey) || { count: 0, label: aNames.map(function (sAlv) {
            var sField = sSide === "ALV" ? sAlv : oColumns[sAlv];
            return sAlv + "=" + String(oRow[sField]);
          }).join(", ") };
          oEntry.count += 1;
          oIndex.set(sKey, oEntry);
        });
        return oIndex;
      }
      var oFullAlv = fullRows(aAlv, "ALV");
      var oFullOData = fullRows(aOData, "OData");
      var aFullDifferences = [];
      oFullAlv.forEach(function (oEntry, sKey) {
        for (var i = 0; i < oEntry.count - (oFullOData.get(sKey) || { count: 0 }).count; i++) {
          aFullDifferences.push({ kind: "MISSING", key: oEntry.label, column: "",
            alv: "row present", odata: "row missing" });
        }
      });
      oFullOData.forEach(function (oEntry, sKey) {
        for (var i = 0; i < oEntry.count - (oFullAlv.get(sKey) || { count: 0 }).count; i++) {
          aFullDifferences.push({ kind: "EXTRA", key: oEntry.label, column: "",
            alv: "row missing", odata: "row present" });
        }
      });
      return { status: aFullDifferences.length ? "FAIL" : "PASS", alvCount: aAlv.length,
        odataCount: aOData.length, differences: aFullDifferences };
    }
    function index(aRows, sSide) {
      var oIndex = new Map();
      aRows.forEach(function (oRow, iRow) {
        aNames.forEach(function (sAlv) {
          var sField = sSide === "ALV" ? sAlv : oColumns[sAlv];
          if (!Object.prototype.hasOwnProperty.call(oRow, sField)) {
            throw new Error(sSide + " row " + (iRow + 1) + " is missing column " + sField + ".");
          }
          try { canonical(oRow[sField], oTypes[oColumns[sAlv]]); }
          catch (oError) {
            throw new Error(sSide + " row " + (iRow + 1) + ", column " + sField + ": " + oError.message);
          }
        });
        var aKey = aKeys.map(function (sAlv) {
          var vValue = oRow[sSide === "ALV" ? sAlv : oColumns[sAlv]];
          if (vValue === null) { throw new Error(sSide + " business key " + sAlv + " is null."); }
          return canonical(vValue, oTypes[oColumns[sAlv]]);
        });
        var sKey = JSON.stringify(aKey);
        var sDisplayKey = aKeys.map(function (sAlv) {
          return sAlv + "=" + String(oRow[sSide === "ALV" ? sAlv : oColumns[sAlv]]);
        }).join(", ");
        if (oIndex.has(sKey)) { throw new Error(sSide + " has duplicate business key " + sDisplayKey + "."); }
        oIndex.set(sKey, { row: oRow, displayKey: sDisplayKey });
      });
      return oIndex;
    }
    var oAlv = index(aAlv, "ALV");
    var oTarget = index(aOData, "OData");
    var aDifferences = [];
    oAlv.forEach(function (oEntry, sKey) {
      var oMatch = oTarget.get(sKey);
      if (!oMatch) {
        aDifferences.push({ kind: "MISSING", key: oEntry.displayKey, column: "", alv: "row present", odata: "row missing" });
        return;
      }
      aNames.forEach(function (sAlv) {
        var sTarget = oColumns[sAlv];
        var vAlv = oEntry.row[sAlv];
        var vTarget = oMatch.row[sTarget];
        if (canonical(vAlv, oTypes[sTarget]) !== canonical(vTarget, oTypes[sTarget])) {
          aDifferences.push({ kind: "VALUE", key: oEntry.displayKey, column: sAlv + " → " + sTarget,
            alv: vAlv === null ? "null" : String(vAlv), odata: vTarget === null ? "null" : String(vTarget) });
        }
      });
    });
    oTarget.forEach(function (oEntry, sKey) {
      if (!oAlv.has(sKey)) {
        aDifferences.push({ kind: "EXTRA", key: oEntry.displayKey, column: "", alv: "row missing", odata: "row present" });
      }
    });
    return { status: aDifferences.length ? "FAIL" : "PASS", alvCount: aAlv.length,
      odataCount: aOData.length, differences: aDifferences };
  }

  return { objectJson: objectJson, selections: selections, filterValues: filterValues,
    mapping: mapping, completeColumns: completeColumns, projectedColumns: projectedColumns,
    schemaDifferences: schemaDifferences,
    mappingLog: mappingLog, keys: keys,
    metadataKeys: metadataKeys, capture: capture,
    canonical: canonical, compare: compare };
});
