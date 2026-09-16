sap.ui.define(["sap/ui/core/Core"], function (Core) {
  "use strict";

  return Object.freeze({
    getMessageModel: function () {
      var oManager = Core && typeof Core.getMessageManager === "function" ?
        Core.getMessageManager() : null;
      return oManager && typeof oManager.getMessageModel === "function" ?
        oManager.getMessageModel() : null;
    }
  });
});
