sap.ui.define([
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/model/Sorter",
  "abap/to/fiori/system/util/TableStateSanitizer"
], function (Filter, FilterOperator, Sorter, TableStateSanitizer) {
  "use strict";

  var STORAGE_PREFIX = "abap.to.fiori.system.p13n.";

  function TablePersonalizationService(oStorage) {
    this._oStorage = oStorage || (typeof window !== "undefined" && window.localStorage);
  }

  TablePersonalizationService.prototype.getStorageKey = function (sTableKey) {
    return STORAGE_PREFIX + String(sTableKey || "unknown");
  };

  TablePersonalizationService.prototype.loadState = function (oConfig) {
    var oDefault = TableStateSanitizer.createDefaultState(oConfig);
    var sRaw = this._oStorage && this._oStorage.getItem(this.getStorageKey(oConfig.tableKey));
    var oState = oDefault;

    if (sRaw) {
      try {
        oState = Object.assign({}, oDefault, JSON.parse(sRaw));
      } catch (oError) {
        oState = oDefault;
      }
    }

    oState = TableStateSanitizer.sanitizeState(oState, oConfig);
    this.saveState(oConfig, oState);
    return oState;
  };

  TablePersonalizationService.prototype.saveState = function (oConfig, oState) {
    var oClean = TableStateSanitizer.sanitizeState(oState, oConfig);
    if (this._oStorage) {
      this._oStorage.setItem(this.getStorageKey(oConfig.tableKey), JSON.stringify(oClean));
    }
    return oClean;
  };

  TablePersonalizationService.prototype.resetState = function (oConfig) {
    var oState = TableStateSanitizer.createDefaultState(oConfig);
    this.saveState(oConfig, oState);
    return oState;
  };

  TablePersonalizationService.prototype.getVisibleExportableFields = function (oConfig, oState) {
    var mFields = {};
    (oConfig.fields || []).forEach(function (oField) {
      mFields[oField.key] = oField;
    });

    return TableStateSanitizer.sanitizeState(oState, oConfig).columns.filter(function (oColumn) {
      var oField = mFields[oColumn.key];
      return oColumn.visible === true && oField && oField.exportable === true;
    }).map(function (oColumn) {
      return mFields[oColumn.key];
    });
  };

  TablePersonalizationService.prototype.toColumnMap = function (oConfig, oState) {
    return TableStateSanitizer.sanitizeState(oState, oConfig).columns.reduce(function (mResult, oColumn) {
      var oField = (oConfig.fields || []).filter(function (oConfigField) {
        return oConfigField.key === oColumn.key;
      })[0];
      if (oField) {
        mResult[oField.stateKey] = oColumn.visible === true;
      }
      return mResult;
    }, {});
  };

  TablePersonalizationService.prototype.buildFilters = function (aFilterState) {
    return (Array.isArray(aFilterState) ? aFilterState : []).filter(function (oFilter) {
      return oFilter && oFilter.key && oFilter.operator && oFilter.value !== "" && oFilter.value !== undefined && oFilter.value !== null;
    }).map(function (oFilter) {
      var sOperator = FilterOperator[oFilter.operator] || oFilter.operator;
      if (oFilter.operator === "BT") {
        return new Filter(oFilter.key, sOperator, oFilter.value, oFilter.value2);
      }
      return new Filter(oFilter.key, sOperator, oFilter.value);
    });
  };

  TablePersonalizationService.prototype.buildSorters = function (aSorters, aGroups) {
    var aResult = [];

    (Array.isArray(aGroups) ? aGroups : []).forEach(function (oGroup) {
      aResult.push(new Sorter(oGroup.key, oGroup.descending === true, true));
    });
    (Array.isArray(aSorters) ? aSorters : []).forEach(function (oSorter) {
      aResult.push(new Sorter(oSorter.key, oSorter.descending === true));
    });

    return aResult;
  };

  return TablePersonalizationService;
});
