sap.ui.define([
  "sap/ui/core/UIComponent",
  "abap/to/fiori/system/model/models",
  "abap/to/fiori/system/service/ODataService"
], function (UIComponent, models, ODataService) {
  "use strict";

  return UIComponent.extend("abap.to.fiori.system.Component", {
    metadata: {
      manifest: "json"
    },

    init: function () {
      UIComponent.prototype.init.apply(this, arguments);

      // JSON models hold UI state only. Business data comes from the default OData V4 model.
      this.setModel(models.createDeviceModel(), "device");
      this.setModel(models.createViewModel(), "view");

      // Reusable service wrapper around OData V4 and server-driven paging endpoints.
      this._oODataService = new ODataService(
        this.getModel(),
        this.getManifestEntry("/sap.app/dataSources/mainService/uri")
      );

      this.getRouter().initialize();
    },

    getODataService: function () {
      return this._oODataService;
    }
  });
});
