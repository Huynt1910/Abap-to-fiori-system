sap.ui.define(
  [
    "sap/ui/core/UIComponent",
    "abap/to/fiori/system/model/models",
    "abap/to/fiori/system/service/AnalysisService",
    "abap/to/fiori/system/service/ProgramValueHelpService",
    "abap/to/fiori/system/service/DocumentService",
    "abap/to/fiori/system/service/MailService",
    "abap/to/fiori/system/service/RequestHistoryService",
    "abap/to/fiori/system/service/AuthenticationService",
    "abap/to/fiori/system/util/ThemeParameters",
  ],
  function (
    UIComponent,
    models,
    AnalysisService,
    ProgramValueHelpService,
    DocumentService,
    MailService,
    RequestHistoryService,
    AuthenticationService,
    ThemeParameters,
  ) {
    "use strict";

    return UIComponent.extend("abap.to.fiori.system.Component", {
      metadata: {
        manifest: "json",
      },

      init: function () {
        UIComponent.prototype.init.apply(this, arguments);

        this.setModel(this.getModel(), "odata");
        this.setModel(models.createDeviceModel(), "device");
        this._oAuthenticationService = new AuthenticationService();
        this.setModel(this._oAuthenticationService.getModel(), "auth");
        this._oAuthenticationService.restoreSession().catch(function () {
          // The auth model carries the error state and clears its busy flag.
        });
        this._oAnalysisService = new AnalysisService(this.getModel());
        this._oProgramValueHelpService = new ProgramValueHelpService(
          this.getModel(),
        );
        this._oDocumentService = new DocumentService(this.getModel());
        this._oMailService = new MailService(this.getModel("mail"));
        this._oRequestHistoryService = new RequestHistoryService(
          this.getModel(), this.getManifest()["sap.app"].dataSources.mainService.uri
        );
        this._fnApplyTheme = function () {
          var oRoot = this.getRootControl();
          ThemeParameters.apply(oRoot && oRoot.getDomRef());
        }.bind(this);
        sap.ui.getCore().attachThemeChanged(this._fnApplyTheme);
        this.rootControlLoaded().then(function (oRoot) {
          if (this.bIsDestroyed) { return; }
          oRoot.addEventDelegate({ onAfterRendering: this._fnApplyTheme });
          this._fnApplyTheme();
        }.bind(this));
        this.getRouter().initialize();
      },

      exit: function () {
        sap.ui.getCore().detachThemeChanged(this._fnApplyTheme);
      },

      getAnalysisService: function () {
        return this._oAnalysisService;
      },

      getProgramValueHelpService: function () {
        return this._oProgramValueHelpService;
      },

      getRequestHistoryService: function () {
        return this._oRequestHistoryService;
      },

      getAuthenticationService: function () {
        return this._oAuthenticationService;
      },

      getDocumentService: function () {
        return this._oDocumentService;
      },

      getMailService: function () {
        return this._oMailService;
      },

      setPendingCreatedMailJobId: function (sJobId) {
        this._sPendingCreatedMailJobId = sJobId || "";
        this._bPendingMailJobsRefresh = true;
      },

      consumePendingCreatedMailJobId: function () {
        var sJobId = this._sPendingCreatedMailJobId;
        this._sPendingCreatedMailJobId = "";
        return sJobId;
      },

      consumePendingMailJobsRefresh: function () {
        var bRefresh = !!this._bPendingMailJobsRefresh;
        this._bPendingMailJobsRefresh = false;
        return bRefresh;
      },
    });
  },
);
