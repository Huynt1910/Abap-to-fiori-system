sap.ui.define([
  "sap/ui/model/Sorter",
  "abap/to/fiori/system/util/Constants"
], function (Sorter, Constants) {
  "use strict";

  function ProgramValueHelpService(oODataModel) {
    this._oModel = oODataModel;
  }

  ProgramValueHelpService.prototype.searchPrograms = function (sSearch, iTop) {
    var sQuery = String(sSearch || "").trim().toUpperCase();
    var mParameters = {
      $select: Constants.field.programName,
      $$groupId: "$direct"
    };
    var oListBinding;

    if (sQuery) {
      mParameters.$search = sQuery;
    }

    oListBinding = this._oModel.bindList(
      Constants.entitySet.programValueHelp,
      undefined,
      [new Sorter(Constants.field.programName, false)],
      [],
      mParameters
    );

    return oListBinding.requestContexts(0, iTop || 50).then(function (aContexts) {
      return aContexts.map(function (oContext) {
        return oContext.getObject();
      });
    });
  };

  return ProgramValueHelpService;
});
