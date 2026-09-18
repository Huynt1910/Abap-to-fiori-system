sap.ui.define([
  "sap/ui/model/json/JSONModel"
], function (JSONModel) {
  "use strict";

  function AuthenticationService(mOptions) {
    this._mOptions = mOptions || {};
    this._fnFetch = this._mOptions.fetch || window.fetch.bind(window);
    this._oLocation = this._mOptions.location || window.location;
    this._oShellContainer = this._mOptions.shellContainer || this._getShellContainer();
    this._bRedirecting = false;
    this._oModel = new JSONModel({
      busy: true,
      authenticated: false,
      mode: "unknown",
      displayName: "",
      btpUser: "",
      sapUser: "",
      sapUserVerified: false,
      scopes: [],
      canRead: false,
      canAnalyze: false,
      canCompare: false,
      canExport: false,
      canMail: false,
      isAdmin: false,
      auditNotice: "",
      error: ""
    });
  }

  AuthenticationService.prototype.getModel = function () {
    return this._oModel;
  };

  AuthenticationService.prototype.restoreSession = function () {
    if (this._isLaunchpad()) {
      this._setLaunchpadState();
      return Promise.resolve(this._oModel.getData());
    }

    if (this._isLocalDevelopment()) {
      this._setLocalDevelopmentState();
      return Promise.resolve(this._oModel.getData());
    }

    this._oModel.setProperty("/busy", true);
    this._oModel.setProperty("/error", "");
    return this._fnFetch("/user-api/currentUser", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" }
    }).then(function (oResponse) {
      if (oResponse.status === 401) {
        this.redirectToLogin();
        throw new Error("Authentication session expired.");
      }
      if (oResponse.status === 403) {
        throw new Error("Your BTP user does not have access to this application.");
      }
      if (!oResponse.ok) {
        throw new Error("Unable to retrieve the authenticated user.");
      }
      return oResponse.json();
    }.bind(this)).then(function (oUser) {
      var aScopes = Array.isArray(oUser.scopes) ? oUser.scopes.slice() : [];
      var bAdmin = this._hasScope(aScopes, "Admin");
      this._oModel.setData({
        busy: false,
        authenticated: true,
        mode: "btp",
        displayName: oUser.displayName || [oUser.firstname, oUser.lastname].filter(Boolean).join(" ") || oUser.name || oUser.email || "Authenticated user",
        btpUser: oUser.name || oUser.email || "",
        sapUser: "",
        sapUserVerified: false,
        scopes: aScopes,
        canRead: bAdmin || this._hasScope(aScopes, "AnalysisRead"),
        canAnalyze: bAdmin || this._hasScope(aScopes, "AnalysisExecute"),
        canCompare: bAdmin || this._hasScope(aScopes, "ComparisonExecute"),
        canExport: bAdmin || this._hasScope(aScopes, "Export"),
        canMail: bAdmin || this._hasScope(aScopes, "MailSend"),
        isAdmin: bAdmin,
        auditNotice: "SAP execution identity is not verified because the backend has no CurrentUser endpoint.",
        error: ""
      });
      return this._oModel.getData();
    }.bind(this)).catch(function (oError) {
      this._oModel.setProperty("/busy", false);
      this._oModel.setProperty("/authenticated", false);
      this._oModel.setProperty("/error", oError.message || "Authentication failed.");
      throw oError;
    }.bind(this));
  };

  AuthenticationService.prototype.handleHttpStatus = function (iStatus) {
    if (Number(iStatus) === 401 && !this._isLocalDevelopment() && !this._isLaunchpad()) {
      this.redirectToLogin();
      return true;
    }
    return false;
  };

  AuthenticationService.prototype.redirectToLogin = function () {
    if (!this._bRedirecting && this._oLocation && typeof this._oLocation.assign === "function") {
      this._bRedirecting = true;
      this._oLocation.assign("/");
    }
  };

  AuthenticationService.prototype.logout = function () {
    if (this._isLaunchpad()) {
      this._oShellContainer.logout();
      return Promise.resolve();
    }

    if (this._isLocalDevelopment()) {
      return Promise.reject(new Error("Local development uses server-side proxy credentials. Stop the local server to end that session."));
    }
    this._oLocation.assign("/do/logout");
    return Promise.resolve();
  };

  AuthenticationService.prototype._hasScope = function (aScopes, sName) {
    return aScopes.some(function (sScope) {
      return sScope === sName || sScope.slice(-(sName.length + 1)) === "." + sName;
    });
  };

  AuthenticationService.prototype._isLocalDevelopment = function () {
    var sHost = String(this._oLocation && this._oLocation.hostname || "").toLowerCase();
    return sHost === "localhost" || sHost === "127.0.0.1" || sHost === "::1";
  };

  AuthenticationService.prototype._getShellContainer = function () {
    return typeof sap !== "undefined" && sap.ushell && sap.ushell.Container || null;
  };

  AuthenticationService.prototype._isLaunchpad = function () {
    return !!(this._oShellContainer &&
      typeof this._oShellContainer.getUser === "function" &&
      typeof this._oShellContainer.logout === "function");
  };

  AuthenticationService.prototype._setLaunchpadState = function () {
    var oUser = this._oShellContainer.getUser();
    var sUserId = oUser && typeof oUser.getId === "function" ? oUser.getId() : "";
    var sDisplayName = oUser && typeof oUser.getFullName === "function" ? oUser.getFullName() : "";

    this._oModel.setData({
      busy: false,
      authenticated: !!oUser,
      mode: "flp",
      displayName: sDisplayName || sUserId || "SAP user",
      btpUser: "",
      sapUser: sUserId,
      sapUserVerified: false,
      scopes: [],
      canRead: true,
      canAnalyze: true,
      canCompare: true,
      canExport: true,
      canMail: true,
      isAdmin: false,
      auditNotice: "Signed in through SAP Fiori Launchpad. Backend audit identity still requires verification by a CurrentUser endpoint.",
      error: ""
    });
  };

  AuthenticationService.prototype._setLocalDevelopmentState = function () {
    this._oModel.setData({
      busy: false,
      authenticated: true,
      mode: "local",
      displayName: "Local development",
      btpUser: "",
      sapUser: "",
      sapUserVerified: false,
      scopes: [],
      canRead: true,
      canAnalyze: true,
      canCompare: true,
      canExport: true,
      canMail: true,
      isAdmin: false,
      auditNotice: "Local requests run as the SAP user configured in the server-side proxy. Audit fields belong to that SAP user.",
      error: ""
    });
  };

  return AuthenticationService;
});
