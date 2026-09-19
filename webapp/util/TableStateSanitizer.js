sap.ui.define([
  "abap/to/fiori/system/config/TechnicalFields"
], function (TechnicalFields) {
  "use strict";

  var SCHEMA_VERSION = 2;

  function clone(vValue) {
    return JSON.parse(JSON.stringify(vValue || {}));
  }

  function getFieldKey(oField) {
    return oField && (oField.key || oField.fieldKey || oField.path);
  }

  function isAllowedField(oField) {
    return !!(oField &&
      oField.personalizable === true &&
      oField.technical !== true &&
      TechnicalFields.isTechnical(getFieldKey(oField)) !== true);
  }

  function toRegistryMap(oConfig) {
    var mFields = {};

    (oConfig && oConfig.fields || []).forEach(function (oField) {
      var sKey = getFieldKey(oField);
      if (sKey) {
        mFields[sKey] = oField;
      }
    });

    return mFields;
  }

  function getAllowedFields(oConfig, sCapability) {
    return (oConfig && oConfig.fields || []).filter(function (oField) {
      return isAllowedField(oField) && oField[sCapability || "personalizable"] !== false;
    });
  }

  function isAllowedKey(sKey, mFields, sCapability) {
    var oField = mFields[sKey];
    return isAllowedField(oField) && oField[sCapability || "personalizable"] !== false;
  }

  function sanitizeColumns(aColumns, oConfig) {
    var mFields = toRegistryMap(oConfig);
    var mSeen = {};
    var aResult = [];

    (Array.isArray(aColumns) ? aColumns : []).forEach(function (oColumn) {
      var sKey = oColumn && oColumn.key;
      if (!sKey || mSeen[sKey] || !isAllowedKey(sKey, mFields, "personalizable")) {
        return;
      }
      mSeen[sKey] = true;
      aResult.push({
        key: sKey,
        visible: oColumn.visible === true,
        index: typeof oColumn.index === "number" ? oColumn.index : aResult.length
      });
    });

    getAllowedFields(oConfig).forEach(function (oField) {
      var sKey = getFieldKey(oField);
      if (!mSeen[sKey]) {
        mSeen[sKey] = true;
        aResult.push({
          key: sKey,
          visible: oField.defaultVisible === true,
          index: typeof oField.defaultIndex === "number" ? oField.defaultIndex : aResult.length
        });
      }
    });

    if (!aResult.some(function (oColumn) { return oColumn.visible; }) && aResult.length) {
      aResult[0].visible = true;
    }

    return aResult.sort(function (a, b) {
      return a.index - b.index;
    }).map(function (oColumn, iIndex) {
      return Object.assign({}, oColumn, { index: iIndex });
    });
  }

  function sanitizeFieldState(aItems, oConfig, sCapability) {
    var mFields = toRegistryMap(oConfig);
    var mSeen = {};

    return (Array.isArray(aItems) ? aItems : []).filter(function (oItem) {
      var sKey = oItem && oItem.key;
      if (!sKey || mSeen[sKey] || !isAllowedKey(sKey, mFields, sCapability)) {
        return false;
      }
      mSeen[sKey] = true;
      return true;
    }).map(function (oItem, iIndex) {
      return Object.assign({}, oItem, { index: iIndex });
    });
  }

  function createDefaultState(oConfig) {
    return sanitizeState({
      schemaVersion: SCHEMA_VERSION,
      tableKey: oConfig && oConfig.tableKey,
      columns: getAllowedFields(oConfig).map(function (oField, iIndex) {
        return {
          key: getFieldKey(oField),
          visible: oField.defaultVisible === true,
          index: typeof oField.defaultIndex === "number" ? oField.defaultIndex : iIndex
        };
      }),
      sorters: (oConfig && oConfig.defaultSort || []).map(function (oSorter, iIndex) {
        return { key: oSorter.path || oSorter.key, descending: oSorter.descending === true, index: iIndex };
      }),
      groups: [],
      filters: []
    }, oConfig);
  }

  function sanitizeState(oState, oConfig) {
    var oClean = clone(oState);

    oClean.schemaVersion = SCHEMA_VERSION;
    oClean.tableKey = oConfig && oConfig.tableKey || oClean.tableKey || "";
    oClean.columns = sanitizeColumns(oClean.columns, oConfig);
    oClean.sorters = sanitizeFieldState(oClean.sorters, oConfig, "sortable");
    oClean.groups = sanitizeFieldState(oClean.groups, oConfig, "groupable");
    oClean.filters = sanitizeFieldState(oClean.filters, oConfig, "filterable");

    return oClean;
  }

  return Object.freeze({
    SCHEMA_VERSION: SCHEMA_VERSION,
    isAllowedField: isAllowedField,
    getAllowedFields: getAllowedFields,
    createDefaultState: createDefaultState,
    sanitizeState: sanitizeState
  });
});
