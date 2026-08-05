sap.ui.define([
  "sap/ui/core/UIComponent",
  "abap/to/fiori/system/model/models",
  "abap/to/fiori/system/service/AnalysisService",
  "abap/to/fiori/system/service/DocumentService"
], function (UIComponent, models, AnalysisService, DocumentService) {
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

      this.getRouter().initialize();
    },

    getAnalysisService: function () {
      return this._oAnalysisService;
    },

    getDocumentService: function () {
      return this._oDocumentService;
    }
  });
});
