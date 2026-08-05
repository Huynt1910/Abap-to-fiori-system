sap.ui.define([
  "sap/ui/core/UIComponent",
  "abap/to/fiori/system/model/models",
  "abap/to/fiori/system/service/AnalysisService",
  "abap/to/fiori/system/service/DocumentService",
  "abap/to/fiori/system/service/MailService",
  "sap/ui/model/odata/v4/ODataModel"
], function (UIComponent, models, AnalysisService, DocumentService, MailService) {
  "use strict";

  return UIComponent.extend("abap.to.fiori.system.Component", {
    metadata: {
      manifest: "json"
    },

    init: function () {
      UIComponent.prototype.init.apply(this, arguments);

      this.setModel(models.createDeviceModel(), "device");
      this._oAnalysisService = new AnalysisService(this.getModel());
      this._oDocumentService = new DocumentService(this.getModel());
      this._oMailService = new MailService(this.getModel("mail"));

      this.getRouter().initialize();
    },

    getAnalysisService: function () {
      return this._oAnalysisService;
    },

    getDocumentService: function () {
      return this._oDocumentService;
    },

    getMailService: function () {
      return this._oMailService;
    },

    setPendingCreatedMailJobId: function (sJobId) {
      this._sPendingCreatedMailJobId = sJobId || "";
    },

    consumePendingCreatedMailJobId: function () {
      var sJobId = this._sPendingCreatedMailJobId;
      this._sPendingCreatedMailJobId = "";
      return sJobId;
    }
  });
});
