sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/UIComponent",
  "sap/m/MessageBox",
  "abap/to/fiori/system/util/ODataErrorHandler"
], function (Controller, UIComponent, MessageBox, ODataErrorHandler) {
  "use strict";

  return Controller.extend("abap.to.fiori.system.controller.BaseController", {
    onLogout: function () {
      this.getAuthenticationService().logout().catch(function (oError) {
        MessageBox.information(oError.message);
      });
    },
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

    getRequestHistoryService: function () {
      return this.getOwnerComponent().getRequestHistoryService();
    },

    getProgramValueHelpService: function () {
      return this.getOwnerComponent().getProgramValueHelpService();
    },

    getComparisonService: function () {
      return this.getOwnerComponent().getComparisonService();
    },

    getDocumentService: function () {
      return this.getOwnerComponent().getDocumentService();
    },

    getMailService: function () {
      return this.getOwnerComponent().getMailService();
    },

    getAuthenticationService: function () {
      var oComponent = this.getOwnerComponent();
      return oComponent && typeof oComponent.getAuthenticationService === "function" ?
        oComponent.getAuthenticationService() : null;
    },

    parseError: function (oError) {
      return ODataErrorHandler.parse(oError);
    },

    showErrorMessage: function (sMessage) {
      var fnText = function (sKey, sDefault) {
        try {
          return this.getText(sKey) || sDefault;
        } catch (oError) {
          return sDefault;
        }
      }.bind(this);
      var sClose = fnText("close", "Close");
      var sTitle = fnText("errorTitle", "Error");
      var sFallback = fnText("errorGeneric", "Unexpected error.");

      return MessageBox.error(String(sMessage || sFallback), {
        title: sTitle,
        actions: [sClose],
        emphasizedAction: sClose,
        initialFocus: sClose,
        contentWidth: "34rem",
        styleClass: "migrationAnalyzerErrorMessageBox"
      });
    },

    showError: function (oError, sFallbackKey) {
      var oParsedError = this.parseError(oError);
      var sMessage = oParsedError.message;
      var oAuthentication = this.getAuthenticationService();

      if (oAuthentication && oAuthentication.handleHttpStatus(oParsedError.status)) {
        return;
      }

      if (!sMessage || sMessage === "Unexpected error.") {
        sMessage = this.getText(sFallbackKey || "errorGeneric");
      }

      this.showErrorMessage(sMessage);
    }
  });
});
