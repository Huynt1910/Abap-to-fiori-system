sap.ui.define(
  ["sap/ui/core/mvc/Controller", "sap/ui/model/json/JSONModel"],
  function (Controller, JSONModel) {
    "use strict";

    return Controller.extend("abap.to.fiori.system.controller.Dashboard", {
      onInit: function () {
        const oModel = new JSONModel();
        oModel.loadData("mockdata/reports.json");
        this.getView().setModel(oModel);
      },
    });
  },
);
