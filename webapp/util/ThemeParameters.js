sap.ui.define(["sap/ui/core/theming/Parameters"], function (Parameters) {
  "use strict";

  // UI5 1.108 does not publish all CSS variables. Scope the real theme values
  // to the app root (or a popup root), and reapply after a theme change.
  var aNames = [
    "sapAccentColor6", "sapBackgroundColor", "sapTextColor", "sapSelectedColor",
    "sapGroup_ContentBackground", "sapGroup_ContentBorderColor",
    "sapContent_ContrastIconColor", "sapContent_ContrastTextColor", "sapContent_LabelColor",
    "sapContent_ForegroundBorderColor", "sapContent_Shadow0", "sapContent_Shadow1", "sapContent_Shadow2",
    "sapButton_Emphasized_Background", "sapButton_Emphasized_TextColor", "sapHighlightColor",
    "sapPositiveColor", "sapPositiveTextColor", "sapCriticalColor", "sapCriticalTextColor",
    "sapNegativeColor", "sapNegativeTextColor", "sapInformationBackground", "sapInformationBorderColor",
    "sapSuccessBackground", "sapWarningBackground", "sapErrorBackground",
    "sapList_Background", "sapList_BorderColor", "sapTile_Background", "sapTile_BorderColor"
  ];

  return {
    apply: function (oDom) {
      if (!oDom) { return; }
      aNames.forEach(function (sName) {
        var sValue = Parameters.get(sName);
        if (sValue) { oDom.style.setProperty("--" + sName, sValue); }
      });
    }
  };
});
