sap.ui.define([
  "sap/ui/core/Fragment", "sap/m/MessageBox", "sap/ui/core/format/DateFormat", "abap/to/fiori/system/util/ThemeParameters",
  "abap/to/fiori/system/service/ChatService", "abap/to/fiori/system/model/ChatState"
], function (Fragment, MessageBox, DateFormat, ThemeParameters, ChatService, ChatState) {
  "use strict";

  function AnalysisChatBox(oController) {
    this.view = oController.getView();
    this.router = oController.getRouter();
    this.text = oController.getText.bind(oController);
    this.followLatest = true;
    this.state = new ChatState(new ChatService(oController.getODataModel(), function () {
      var oAuth = oController.getOwnerComponent().getModel("auth");
      if (oAuth && oAuth.getProperty("/sapUserVerified")) { return oAuth.getProperty("/sapUser"); }
      // Native SAP Launchpad identity can narrow reads, but never replaces backend authorization.
      var oShell = sap.ushell && sap.ushell.Container;
      var oUser = oShell && oShell.getUser && oShell.getUser();
      return oUser && oUser.getId ? oUser.getId() : "";
    }), this.text, this._scroll.bind(this));
    this.view.setModel(this.state.model, "chatModel");
    this.router.attachRouteMatched(this._route, this);
    this._viewDelegate = { onBeforeHide: function () { this.state.close(); if (this.root) { this.root.setVisible(false); } }.bind(this) };
    this.view.addEventDelegate(this._viewDelegate);
    this.ready = Fragment.load({
      id: this.view.getId(), name: "abap.to.fiori.system.view.fragments.AnalysisChatBox", controller: this
    }).then(function (oRoot) {
      if (this.destroyed) { oRoot.destroy(); return; }
      this.root = oRoot;
      oRoot.addEventDelegate({ onAfterRendering: this._theme.bind(this), onkeydown: function (oEvent) {
        if (oEvent.key === "Escape" && this.state.get("isOpen") && !this.state.get("renameOpen")) {
          oEvent.preventDefault(); this.onCloseAIChat();
        }
      }.bind(this) });
      sap.ui.getCore().attachThemeChanged(this._theme, this);
      this.view.byId("analysisChatHost").addItem(oRoot);
      oRoot.setVisible(!!this.state.get("analysisId") && this.active);
      this._inputDelegate = { onkeydown: this._keydown.bind(this) };
      this.view.byId("aiChatDraft").addEventDelegate(this._inputDelegate);
      this._scrollDelegate = { onAfterRendering: function () {
        var oScroll = this.view.byId("aiChatScroll").getDomRef();
        if (oScroll) {
          oScroll.onscroll = function () {
            this.followLatest = oScroll.scrollHeight - oScroll.scrollTop - oScroll.clientHeight < 64;
          }.bind(this);
        }
        this._scroll(false);
      }.bind(this) };
      this.view.byId("aiChatScroll").addEventDelegate(this._scrollDelegate);
    }.bind(this)).catch(function () {
      if (!this.destroyed) { MessageBox.error(this.text("chatUiFailed")); }
    }.bind(this));
  }

  AnalysisChatBox.prototype._route = function (oEvent) {
    var sName = oEvent.getParameter("name");
    this.active = sName === "analysisDetail" || sName === "detail";
    clearTimeout(this.closeTimer);
    this.closeTimer = null;
    var oPanel = this.view.byId("aiChatPanel");
    if (oPanel) { oPanel.removeStyleClass("analysisChatPanelClosing"); }
    if (this.active) {
      this.state.activate(decodeURIComponent((oEvent.getParameter("arguments") || {}).analysisId || ""));
    } else { this.state.close(); }
    if (this.root) { this.root.setVisible(this.active); }
  };
  AnalysisChatBox.prototype.onOpenAIChat = function () {
    clearTimeout(this.closeTimer);
    var oPanel = this.view.byId("aiChatPanel");
    if (oPanel) { oPanel.removeStyleClass("analysisChatPanelClosing"); }
    this.state.open(); this._scroll(true);
    setTimeout(function () { if (!this.destroyed) { this.view.byId("aiChatDraft").focus(); } }.bind(this), 0);
  };
  AnalysisChatBox.prototype.onCloseAIChat = function () {
    if (this.closeTimer) { return; }
    var oPanel = this.view.byId("aiChatPanel");
    if (oPanel) { oPanel.addStyleClass("analysisChatPanelClosing"); }
    this.closeTimer = setTimeout(function () {
      this.closeTimer = null;
      this.state.close();
      if (oPanel) { oPanel.removeStyleClass("analysisChatPanelClosing"); }
      var oLauncher = this.view.byId("aiChatLauncher");
      if (oLauncher) { oLauncher.focus(); }
    }.bind(this), 180);
  };
  AnalysisChatBox.prototype.onSendAIMessage = function () { return this.state.send(); };
  AnalysisChatBox.prototype.onChatDraftChange = function (oEvent) { this.state.set("draftMessage", oEvent.getParameter("value")); };
  AnalysisChatBox.prototype.onCreateChatSession = function () { return this.state.create(); };
  AnalysisChatBox.prototype.onOpenChatHistory = function () { return this.state.history(); };
  AnalysisChatBox.prototype.onBackFromChatHistory = function () { return this.state.history(); };
  AnalysisChatBox.prototype.onChatSessionSearch = function (oEvent) { this.state.set("sessionSearch", oEvent.getParameter("newValue")); };
  AnalysisChatBox.prototype.onSelectChatSession = function (oEvent) {
    var oItem = oEvent.getParameter("listItem");
    return this.state.select(oItem.getBindingContext("chatModel").getProperty("SessionId"));
  };
  AnalysisChatBox.prototype.onRetryAIChat = function () { return this.state.load(); };
  AnalysisChatBox.prototype.onRetryFailedMessage = function (oEvent) {
    var oContext = oEvent.getSource().getBindingContext("chatModel");
    return oContext ? this.state.retryFailed(oContext.getProperty("MessageId")) : Promise.resolve();
  };
  AnalysisChatBox.prototype.onDismissChatContextNotice = function () { this.state.dismissContextNotice(); };
  AnalysisChatBox.prototype.onChatActionSelected = function (oEvent) {
    return this._handleSessionAction(
      oEvent.getParameter("item").getKey(),
      this.state.get("activeSessionId"),
      this.state.get("activeTitle"),
      this.view.byId("aiChatMoreActions")
    );
  };
  AnalysisChatBox.prototype.onHistorySessionActionSelected = function (oEvent) {
    var oItem = oEvent.getParameter("item");
    var oContext = oItem && oItem.getBindingContext("chatModel");
    var oSession = oContext && oContext.getObject();
    var oAnchor = oEvent.getSource().getParent && oEvent.getSource().getParent();
    return oSession ? this._handleSessionAction(oItem.getKey(), oSession.SessionId, oSession.SessionName, oAnchor) : Promise.resolve();
  };
  AnalysisChatBox.prototype._handleSessionAction = function (sAction, sSessionId, sTitle, oAnchor) {
    if (sAction === "rename") { return this._openRename(sSessionId, sTitle, oAnchor); }
    if (sAction === "delete") { return this._confirmDelete(sSessionId); }
    return Promise.resolve();
  };
  AnalysisChatBox.prototype._openRename = function (sSessionId, sTitle, oAnchor) {
    this.state.beginRename(sSessionId, sTitle);
    if (!this._pRenamePopover) {
      this._pRenamePopover = Fragment.load({
        id: this.view.getId(), name: "abap.to.fiori.system.view.fragments.AnalysisChatRename", controller: this
      }).then(function (oPopover) {
        this.view.addDependent(oPopover);
        oPopover.attachAfterOpen(this.onRenameAfterOpen, this);
        oPopover.attachAfterClose(this.onRenameAfterClose, this);
        return oPopover;
      }.bind(this));
    }
    return this._pRenamePopover.then(function (oPopover) {
      if (!this.destroyed) { oPopover.openBy(oAnchor || this.view.byId("aiChatMoreActions")); }
    }.bind(this));
  };
  AnalysisChatBox.prototype.onRenameAfterOpen = function () {
    var oInput = this.view.byId("chatRenameInput");
    if (!oInput) { return; }
    if (!this._renameBrowserEventAttached) {
      oInput.attachBrowserEvent("keydown", this._renameKeydown, this);
      this._renameBrowserEventAttached = true;
    }
    oInput.focus();
    oInput.selectText(0, oInput.getValue().length);
  };
  AnalysisChatBox.prototype._renameKeydown = function (oEvent) {
    if (oEvent.key === "Escape" || oEvent.keyCode === 27) {
      oEvent.preventDefault(); oEvent.stopPropagation(); this.onCancelChatName();
    }
  };
  AnalysisChatBox.prototype.onSaveChatName = function () {
    return this.state.rename().then(function (bSaved) {
      if (bSaved) { return this._pRenamePopover.then(function (oPopover) { oPopover.close(); }); }
    }.bind(this));
  };
  AnalysisChatBox.prototype.onCancelChatName = function () {
    if (this.state.get("renameBusy")) { return; }
    if (this._pRenamePopover) { this._pRenamePopover.then(function (oPopover) { oPopover.close(); }); }
  };
  AnalysisChatBox.prototype.onRenameAfterClose = function () { this.state.cancelRename(); };
  AnalysisChatBox.prototype._confirmDelete = function (sId) {
    var sAnalysisId = this.state.get("analysisId");
    MessageBox.confirm(this.text("chatDeleteConfirm"), {
      onClose: function (sAction) {
        if (!this.destroyed && sAction === MessageBox.Action.OK && sAnalysisId === this.state.get("analysisId")) {
          this.state.remove(sId);
        }
      }.bind(this)
    });
  };
  AnalysisChatBox.prototype._keydown = function (oEvent) {
    this.state.set("draftMessage", this.view.byId("aiChatDraft").getValue());
    this.state.keydown(oEvent);
  };
  AnalysisChatBox.prototype.formatTime = function (sValue) {
    if (!sValue) { return ""; }
    var oDate = new Date(sValue);
    return isNaN(oDate.getTime()) ? "" : DateFormat.getDateTimeInstance({ style: "short" }).format(oDate);
  };
  AnalysisChatBox.prototype.formatSessionVisible = function (sName, sPreview, sQuery) {
    var sNeedle = String(sQuery || "").trim().toLocaleLowerCase();
    return !sNeedle || (String(sName || "") + " " + String(sPreview || "")).toLocaleLowerCase().indexOf(sNeedle) !== -1;
  };
  AnalysisChatBox.prototype._theme = function () {
    var oDom = this.root && this.root.getDomRef();
    if (!oDom) { return; }
    var oPanel = oDom.querySelector(".analysisChatPanel");
    if (oPanel) { oPanel.setAttribute("role", "complementary"); oPanel.setAttribute("aria-label", this.text("chatTitle")); }
    var oBadge = oDom.querySelector(".analysisChatBadge");
    if (oBadge) { oBadge.setAttribute("role", "status"); oBadge.setAttribute("aria-live", "polite"); }
    ThemeParameters.apply(oDom);
  };
  AnalysisChatBox.prototype._scroll = function (bForce, bShowError) {
    if (bForce) { this.followLatest = true; }
    clearTimeout(this.scrollTimer);
    this.scrollTimer = setTimeout(function () {
      if (this.destroyed || !this.state.get("isOpen") || !bShowError && !this.followLatest) { return; }
      var oControl = this.view.byId("aiChatScroll");
      if (oControl) { oControl.scrollTo(0, bShowError ? 0 : 10000000, 0); }
    }.bind(this), 0);
  };
  AnalysisChatBox.prototype.destroy = function () {
    this.destroyed = true;
    clearTimeout(this.scrollTimer);
    clearTimeout(this.closeTimer);
    this.router.detachRouteMatched(this._route, this);
    sap.ui.getCore().detachThemeChanged(this._theme, this);
    this.view.removeEventDelegate(this._viewDelegate);
    if (this.root) { this.root.destroy(); }
    this.state.destroy();
  };
  return AnalysisChatBox;
});
