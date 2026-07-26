sap.ui.define([
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "abap/to/fiori/system/util/Constants"
], function (Filter, FilterOperator, Constants) {
  "use strict";

  function ProgramService(oODataModel) {
    this._oModel = oODataModel;
  }

  /**
   * Searches ProgramValueHelp server-side.
   * @param {string} sQuery Search text.
   * @returns {Promise<object[]>} Matching programs.
   */
  ProgramService.prototype.searchPrograms = function (sQuery) {
    var mParameters = {
      $$ownRequest: true,
      $top: 20
    };

    if (sQuery) {
      mParameters.$search = sQuery;
    }

    return this._readList(Constants.entitySet.programValueHelp, {
      parameters: mParameters,
      length: 20
    });
  };

  /**
   * Reads one program from value help by RootProgram.
   * @param {string} sRootProgram Root ABAP program.
   * @returns {Promise<object|null>} Program entry.
   */
  ProgramService.prototype.getProgramByName = function (sRootProgram) {
    if (!sRootProgram) {
      return Promise.resolve(null);
    }

    return this._readList(Constants.entitySet.programValueHelp, {
      filters: [new Filter(Constants.field.rootProgram, FilterOperator.EQ, sRootProgram)],
      length: 1
    }).then(function (aRows) {
      return aRows[0] || null;
    });
  };

  ProgramService.prototype._readList = function (sPath, mOptions) {
    var mReadOptions = mOptions || {};
    var oListBinding = this._oModel.bindList(
      sPath,
      undefined,
      mReadOptions.sorters || [],
      mReadOptions.filters || [],
      mReadOptions.parameters || {}
    );

    return oListBinding.requestContexts(0, mReadOptions.length || 20).then(function (aContexts) {
      return aContexts.map(function (oContext) {
        return oContext.getObject();
      });
    });
  };

  return ProgramService;
});
