sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/UIComponent",
  "sap/m/MessageBox",
  "abap/to/fiori/system/util/ODataErrorHandler"
], function (Controller, UIComponent, MessageBox, ODataErrorHandler) {
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

    getDocumentService: function () {
      return this.getOwnerComponent().getDocumentService();
    },

    getMailService: function () {
      return this.getOwnerComponent().getMailService();
    },

    parseError: function (oError) {
      return ODataErrorHandler.parse(oError);
    },

    showError: function (oError, sFallbackKey) {
      var oParsedError = this.parseError(oError);
      var sMessage = oParsedError.message;

      if (!sMessage || sMessage === "Unexpected error.") {
        sMessage = this.getText(sFallbackKey || "errorGeneric");
      }

      MessageBox.error(sMessage);
    }
  });
});
