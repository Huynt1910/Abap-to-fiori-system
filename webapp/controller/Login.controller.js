sap.ui.define([
  "abap/to/fiori/system/controller/BaseController",
  "abap/to/fiori/system/service/AuthService",
  "sap/ui/model/json/JSONModel"
], function (BaseController, AuthService, JSONModel) {
  "use strict";

  return BaseController.extend("abap.to.fiori.system.controller.Login", {
    onInit: function () {
      this.getView().setModel(new JSONModel({
        username: "",
        password: "",
        busy: false,
        errorVisible: false,
        errorMessage: ""
      }), "login");
    },

    onLoginPress: function () {
      var oModel = this.getView().getModel("login");
      var sUsername = oModel.getProperty("/username");
      var sPassword = oModel.getProperty("/password");

      if (!sUsername || !sPassword) {
        oModel.setProperty("/errorVisible", true);
        oModel.setProperty("/errorMessage", this.getText("loginErrorRequired"));
        return;
      }

      oModel.setProperty("/busy", true);
      oModel.setProperty("/errorVisible", false);

      var sServiceUrl = this.getOwnerComponent()
        .getManifestEntry("/sap.app/dataSources/mainService/uri");

      AuthService.login(sUsername, sPassword, sServiceUrl)
        .then(function (bSuccess) {
          oModel.setProperty("/busy", false);
          oModel.setProperty("/password", "");

          if (bSuccess) {
            this.getOwnerComponent().onLoginSuccess();
          } else {
            oModel.setProperty("/errorVisible", true);
            oModel.setProperty("/errorMessage", this.getText("loginErrorInvalid"));
          }
        }.bind(this));
    }
  });
});