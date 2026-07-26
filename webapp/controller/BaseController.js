sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/UIComponent",
  "sap/m/MessageBox"
], function (Controller, UIComponent, MessageBox) {
  "use strict";

  return Controller.extend("abap.to.fiori.system.controller.BaseController", {
    getRouter: function () {
      return UIComponent.getRouterFor(this);
    },

    getResourceBundle: function () {
      return this.getOwnerComponent().getModel("i18n").getResourceBundle();
    },

    getText: function (sKey, aArgs) {
      return this.getResourceBundle().getText(sKey, aArgs);
    },

    getODataModel: function () {
      return this.getOwnerComponent().getModel();
    },

    getAnalysisService: function () {
      return this.getOwnerComponent().getAnalysisService();
    },

    getProgramService: function () {
      return this.getOwnerComponent().getProgramService();
    },

    getDocumentService: function () {
      return this.getOwnerComponent().getDocumentService();
    },

    showError: function (oError, sFallbackKey) {
      var sMessage = oError && oError.message ? oError.message : this.getText(sFallbackKey || "errorGeneric");
      MessageBox.error(sMessage);
    }
  });
});
