sap.ui.define(
  [
    "sap/ui/core/UIComponent",
    "abap/to/fiori/system/model/models",
    "abap/to/fiori/system/service/AnalysisService",
    "abap/to/fiori/system/service/ProgramValueHelpService",
    "abap/to/fiori/system/service/ComparisonService",
    "abap/to/fiori/system/service/DocumentService",
    "abap/to/fiori/system/service/MailService",
    "abap/to/fiori/system/service/AuthService",
    "sap/ui/model/odata/v4/ODataModel",
  ],
  function (
    UIComponent,
    models,
    AnalysisService,
    ProgramValueHelpService,
    ComparisonService,
    DocumentService,
    MailService,
    AuthService,
  ) {
    "use strict";

    return UIComponent.extend("abap.to.fiori.system.Component", {
      metadata: {
        manifest: "json",
      },

      init: function () {
        UIComponent.prototype.init.apply(this, arguments);

        this.setModel(models.createDeviceModel(), "device");
        this._oAnalysisService = new AnalysisService(this.getModel());
        this._oProgramValueHelpService = new ProgramValueHelpService(
          this.getModel(),
        );
        this._oComparisonService = new ComparisonService(
          this.getModel("comparison"),
        );
        this._oDocumentService = new DocumentService(this.getModel());
        this._oMailService = new MailService(this.getModel("mail"));

        this.getRouter().getTargets().display("login");
      },

      _onRouteMatched: function () {
        if (!AuthService.isLoggedIn()) {
          this.getRouter().getTargets().display("login");
        }
      },

      onLoginSuccess: function () {
        var sAuthHeader = AuthService.getAuthHeader();
        var oHeaders = { Authorization: sAuthHeader };

        this.getModel().changeHttpHeaders(oHeaders);
        this.getModel("mail").changeHttpHeaders(oHeaders);
        this.getModel("comparison").changeHttpHeaders(oHeaders);

        if (this._bRouterStarted) {
          this.getRouter().navTo("dashboard");
          return;
        }

        this._bRouterStarted = true;
        this.getRouter().attachRouteMatched(this._onRouteMatched, this);
        window.location.hash = ""; // đảm bảo luôn vào Dashboard, không dính hash cũ còn sót (vd #/mail)
        this.getRouter().initialize();
      },

      onLogout: function () {
        AuthService.logout();

        this.getModel().changeHttpHeaders({});
        this.getModel("mail").changeHttpHeaders({});
        this.getModel("comparison").changeHttpHeaders({});

        this.getRouter().getTargets().display("login");
      },

      getAnalysisService: function () {
        return this._oAnalysisService;
      },

      getProgramValueHelpService: function () {
        return this._oProgramValueHelpService;
      },

      getComparisonService: function () {
        return this._oComparisonService;
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
