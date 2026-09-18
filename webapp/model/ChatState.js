sap.ui.define(["sap/ui/model/json/JSONModel", "sap/base/Log"], function (JSONModel, Log) {
  "use strict";

  function initial(sAnalysisId) {
    return {
      analysisId: sAnalysisId || "", isOpen: false, isLoading: false, isSending: false,
      error: "", unreadCount: 0, activeSessionId: "", activeTitle: "", sessions: [], messages: [],
      draftMessage: "", historyOpen: false, initialized: false, canRename: false, canDelete: false,
      canAsk: true, renameOpen: false, renameDraft: "", renameOriginalTitle: "", renameBusy: false, renameError: "",
      renameTargetSessionId: "", sessionSearch: "", contextNoticeVisible: false, needsReload: false
    };
  }

  function ChatState(oService, fnText, fnMessagesChanged) {
    this.service = oService;
    this.text = fnText;
    this.changed = fnMessagesChanged || function () {};
    this.model = new JSONModel(initial());
    this.model.setSizeLimit(100000);
    this.generation = 0;
    this.clientMessageSequence = 0;
    this.dismissedContextNotices = Object.create(null);
  }
  ChatState.prototype.get = function (sKey) { return this.model.getProperty("/" + sKey); };
  ChatState.prototype.set = function (sKey, vValue) { this.model.setProperty("/" + sKey, vValue); };
  ChatState.prototype._decorateMessages = function (aRows) {
    return (aRows || []).map(function (oRow, iIndex, aMessages) {
      var sRole = oRow.Role || "ASSISTANT";
      var sPreviousRole = iIndex > 0 ? aMessages[iIndex - 1].Role || "ASSISTANT" : "";
      var sNextRole = iIndex + 1 < aMessages.length ? aMessages[iIndex + 1].Role || "ASSISTANT" : "";
      return Object.assign({}, oRow, {
        IsTyping: oRow.IsTyping === true,
        SendFailed: oRow.SendFailed === true,
        ShowAvatar: sRole !== "USER" && (!sNextRole || sNextRole !== sRole),
        ShowSender: !sPreviousRole || sPreviousRole !== sRole,
        ShowTimestamp: !sNextRole || sNextRole !== sRole
      });
    });
  };
  ChatState.prototype._setMessages = function (aRows) {
    this.set("messages", this._decorateMessages(aRows));
    var sSessionId = this.get("activeSessionId");
    this.set("contextNoticeVisible", !!sSessionId && !this.dismissedContextNotices[sSessionId] && (aRows || []).some(function (oRow) {
      return oRow.IsOutdated === true;
    }));
  };
  ChatState.prototype.activate = function (sId) {
    if (sId !== this.get("analysisId")) {
      this.generation += 1;
      this.dismissedContextNotices = Object.create(null);
      this.model.setData(initial(sId));
    }
  };
  ChatState.prototype.open = async function () {
    this.set("isOpen", true); this.set("unreadCount", 0);
    if (!this.get("initialized")) { await this.load(); }
  };
  ChatState.prototype.close = function () { this.set("isOpen", false); };
  ChatState.prototype._error = function (oError) {
    var iStatus = Number(oError && (oError.status || oError.statusCode));
    if (iStatus === 401) { return this.text("chatUnauthorized"); }
    if (iStatus === 403) { return this.text("chatForbidden"); }
    if (iStatus === 404 || iStatus === 410) { return this.text("chatGone"); }
    if (iStatus === 408 || iStatus === 504 || oError && oError.name === "TimeoutError") { return this.text("chatTimeout"); }
    return this.text("chatRequestFailed");
  };
  ChatState.prototype._run = async function (sBusy, fnWork) {
    if (this.get("isLoading") || this.get("isSending")) { return; }
    var iGeneration = this.generation;
    var fnCurrent = function () { return iGeneration === this.generation; }.bind(this);
    this.set(sBusy, true); this.set("error", "");
    // A timeout does not prove an SAP action failed. Keep the write locked until it settles.
    var iTimer = setTimeout(function () {
      if (fnCurrent()) { this.set("error", this.text("chatStillWaiting")); }
    }.bind(this), 60000);
    try { await fnWork(fnCurrent); }
    catch (oError) {
      Log.error("AI chat request failed", oError && oError.message || String(oError), "abap.to.fiori.system.model.ChatState");
      if (fnCurrent()) {
        this.set("error", this._error(oError)); this.set("needsReload", true);
        this.changed(false, true);
      }
    } finally {
      clearTimeout(iTimer);
      if (fnCurrent()) { this.set(sBusy, false); }
    }
  };
  ChatState.prototype._sessions = async function (fnCurrent) {
    var aRows = await this.service.listSessions(this.get("analysisId"));
    if (fnCurrent()) {
      this.set("sessions", aRows.map(function (oRow) {
        return Object.assign({}, oRow, { Preview: oRow._Messages && oRow._Messages[0] && oRow._Messages[0].Content || "" });
      }));
      this.set("initialized", true);
    }
    return aRows;
  };
  ChatState.prototype._select = async function (oSession, fnCurrent) {
    var aRows = await this.service.messages(this.get("analysisId"), oSession.SessionId);
    if (!fnCurrent()) { return; }
    this.set("activeSessionId", oSession.SessionId);
    this.set("activeTitle", oSession.SessionName);
    this.set("canRename", !!(oSession.__EntityControl && oSession.__EntityControl.Updatable));
    this.set("canDelete", !!(oSession.__EntityControl && oSession.__EntityControl.Deletable));
    this.set("canAsk", !(oSession.__OperationControl && oSession.__OperationControl.ask === false));
    this._setMessages(aRows);
    this.set("historyOpen", false); this.set("renameOpen", false);
    this.set("needsReload", false);
    this.changed(true);
  };
  ChatState.prototype.load = function () {
    return this._run("isLoading", async function (fnCurrent) {
      var aRows = await this._sessions(fnCurrent);
      if (!fnCurrent()) { return; }
      var oSession = aRows.find(function (oRow) { return oRow.SessionId === this.get("activeSessionId"); }.bind(this)) || aRows[0];
      if (oSession) { await this._select(oSession, fnCurrent); }
      else {
        this.set("activeSessionId", ""); this.set("activeTitle", ""); this._setMessages([]);
        this.set("canRename", false); this.set("canDelete", false); this.set("canAsk", true);
        this.set("needsReload", false);
      }
    }.bind(this));
  };
  ChatState.prototype.history = function () {
    this.set("historyOpen", !this.get("historyOpen"));
    this.set("sessionSearch", "");
    if (this.get("historyOpen")) {
      return this._run("isLoading", this._sessions.bind(this));
    }
  };
  ChatState.prototype.select = function (sId) {
    var oSession = this.get("sessions").find(function (oRow) { return oRow.SessionId === sId; });
    if (!oSession) { return Promise.resolve(); }
    return this._run("isLoading", async function (fnCurrent) {
      await this._select(oSession, fnCurrent);
      if (fnCurrent()) { this.set("draftMessage", ""); }
    }.bind(this));
  };
  ChatState.prototype.create = function () {
    return this._run("isLoading", async function (fnCurrent) {
      var oSession = await this.service.createSession(this.get("analysisId"), this.text("chatNewTitle"));
      if (!fnCurrent()) { return; }
      await this._select(oSession, fnCurrent);
      if (!fnCurrent()) { return; }
      this.set("draftMessage", "");
      await this._sessions(fnCurrent);
    }.bind(this));
  };
  ChatState.prototype.send = function () {
    var sQuestion = String(this.get("draftMessage") || "").trim();
    if (!sQuestion || this.get("needsReload") || !this.get("canAsk")) { return Promise.resolve(); }
    if (sQuestion.length > 8000) { this.set("error", this.text("chatTooLong")); return Promise.resolve(); }
    if (this.get("isLoading") || this.get("isSending")) { return Promise.resolve(); }

    var iGeneration = this.generation;
    var sClientId = "pending-" + (++this.clientMessageSequence);
    var sPendingAssistantId = sClientId + "-assistant";
    var aPreviousMessages = (this.get("messages") || []).slice();
    var bAcknowledged = false;

    this._setMessages(aPreviousMessages.concat([{
      MessageId: sClientId,
      Role: "USER",
      Content: sQuestion,
      CreatedAt: new Date().toISOString(),
      IsOptimistic: true
    }, {
      MessageId: sPendingAssistantId,
      Role: "ASSISTANT",
      Content: "",
      CreatedAt: "",
      IsTyping: true
    }]));
    this.set("draftMessage", "");
    this.changed(true);

    return this._run("isSending", async function (fnCurrent) {
      var sAnalysisId = this.get("analysisId");
      var sSessionId = this.get("activeSessionId");
      if (!sSessionId) {
        var oSession = await this.service.createSession(sAnalysisId, this.text("chatNewTitle"));
        if (!fnCurrent()) { return; }
        sSessionId = oSession.SessionId;
        this.set("activeSessionId", sSessionId); this.set("activeTitle", oSession.SessionName);
      }
      await this.service.ask(sAnalysisId, sSessionId, sQuestion);
      if (!fnCurrent()) { return; }
      bAcknowledged = true;
      var aRows = await this.service.messages(sAnalysisId, sSessionId);
      if (!fnCurrent()) { return; }
      var mPrevious = {};
      this.get("messages").forEach(function (oRow) { mPrevious[oRow.MessageId] = true; });
      var iUnread = aRows.filter(function (oRow) { return !mPrevious[oRow.MessageId] && oRow.Role !== "USER"; }).length;
      this._setMessages(aRows.map(function (oRow) {
        return Object.assign({}, oRow, { IsNew: oRow.Role !== "USER" && !mPrevious[oRow.MessageId] });
      }));
      if (!this.get("isOpen")) { this.set("unreadCount", this.get("unreadCount") + iUnread); }
      this.set("error", ""); this.set("needsReload", false);
      this.changed(false);
      var aSessions = await this._sessions(fnCurrent);
      if (!fnCurrent()) { return; }
      var oActive = aSessions.find(function (oRow) { return oRow.SessionId === sSessionId; });
      if (oActive) {
        this.set("activeTitle", oActive.SessionName);
        this.set("canRename", !!(oActive.__EntityControl && oActive.__EntityControl.Updatable));
        this.set("canDelete", !!(oActive.__EntityControl && oActive.__EntityControl.Deletable));
        this.set("canAsk", !(oActive.__OperationControl && oActive.__OperationControl.ask === false));
      }
    }.bind(this)).then(function () {
      if (iGeneration !== this.generation || !this.get("needsReload")) { return; }

      if (bAcknowledged) {
        this._setMessages((this.get("messages") || []).filter(function (oMessage) {
          return oMessage.MessageId !== sPendingAssistantId;
        }));
      } else {
        this._setMessages((this.get("messages") || []).filter(function (oMessage) {
          return oMessage.MessageId !== sPendingAssistantId;
        }).map(function (oMessage) {
          return oMessage.MessageId === sClientId ? Object.assign({}, oMessage, {
            IsOptimistic: false,
            SendFailed: true
          }) : oMessage;
        }));
      }
    }.bind(this));
  };
  ChatState.prototype.retryFailed = async function (sMessageId) {
    var oFailed = (this.get("messages") || []).find(function (oMessage) {
      return oMessage.MessageId === sMessageId && oMessage.SendFailed === true;
    });
    if (!oFailed || this.get("isLoading") || this.get("isSending")) { return; }

    var sQuestion = oFailed.Content;
    await this.load();
    if (this.get("needsReload")) { return; }
    var bAlreadyStored = (this.get("messages") || []).some(function (oMessage) {
      return oMessage.Role === "USER" && String(oMessage.Content || "").trim() === sQuestion;
    });
    if (!bAlreadyStored) {
      this.set("draftMessage", sQuestion);
      return this.send();
    }
  };
  ChatState.prototype.beginRename = function (sSessionId, sTitle) {
    var sCurrentTitle = sTitle !== undefined ? sTitle : this.get("activeTitle");
    this.set("renameTargetSessionId", sSessionId || this.get("activeSessionId"));
    this.set("renameDraft", sCurrentTitle);
    this.set("renameOriginalTitle", sCurrentTitle);
    this.set("renameError", "");
    this.set("renameOpen", true);
  };
  ChatState.prototype.cancelRename = function () {
    this.set("renameOpen", false);
    this.set("renameError", "");
    this.set("renameTargetSessionId", "");
    this.set("renameOriginalTitle", "");
  };
  ChatState.prototype.rename = function () {
    var sName = String(this.get("renameDraft") || "").trim();
    var sSessionId = this.get("renameTargetSessionId") || this.get("activeSessionId");
    var oTarget = (this.get("sessions") || []).find(function (oSession) { return oSession.SessionId === sSessionId; });
    var sCurrentName = oTarget && oTarget.SessionName || this.get("activeTitle");
    if (!sName || sName.length > 80) { this.set("renameError", this.text("chatNameInvalid")); return Promise.resolve(false); }
    if (sName === String(sCurrentName || "").trim() || this.get("renameBusy")) { return Promise.resolve(false); }

    var iGeneration = this.generation;
    this.set("renameBusy", true); this.set("renameError", "");
    return this.service.rename(this.get("analysisId"), sSessionId, sName).then(function () {
      if (iGeneration !== this.generation) { return false; }
      this.set("sessions", (this.get("sessions") || []).map(function (oSession) {
        return oSession.SessionId === sSessionId ? Object.assign({}, oSession, { SessionName: sName }) : oSession;
      }));
      if (sSessionId === this.get("activeSessionId")) { this.set("activeTitle", sName); }
      this.set("renameOpen", false);
      this.set("renameTargetSessionId", "");
      return true;
    }.bind(this)).catch(async function (oError) {
      if (iGeneration !== this.generation) { return false; }
      var iStatus = Number(oError && (oError.status || oError.statusCode));
      if (iStatus === 412) {
        try {
          var aRows = await this.service.listSessions(this.get("analysisId"));
          if (iGeneration === this.generation) {
            this.set("sessions", aRows.map(function (oRow) {
              return Object.assign({}, oRow, { Preview: oRow._Messages && oRow._Messages[0] && oRow._Messages[0].Content || "" });
            }));
            var oFresh = aRows.find(function (oRow) { return oRow.SessionId === this.get("activeSessionId"); }.bind(this));
            if (oFresh) { this.set("activeTitle", oFresh.SessionName); }
          }
        } catch (oRefreshError) {
          Log.warning("Could not refresh chat session after rename conflict", oRefreshError && oRefreshError.message || String(oRefreshError));
        }
        this.set("renameError", this.text("chatRenameConflict"));
      } else {
        this.set("renameError", this._error(oError));
      }
      return false;
    }.bind(this)).finally(function () {
      if (iGeneration === this.generation) { this.set("renameBusy", false); }
    }.bind(this));
  };
  ChatState.prototype.remove = function (sTargetSessionId) {
    var sSessionId = sTargetSessionId || this.get("activeSessionId");
    if (!sSessionId || sSessionId === this.get("activeSessionId") && !this.get("canDelete")) { return Promise.resolve(); }
    return this._run("isLoading", async function (fnCurrent) {
      await this.service.remove(this.get("analysisId"), sSessionId);
      if (!fnCurrent()) { return; }
      if (sSessionId !== this.get("activeSessionId")) {
        this.set("sessions", (this.get("sessions") || []).filter(function (oSession) { return oSession.SessionId !== sSessionId; }));
        return;
      }
      this.set("activeSessionId", ""); this.set("activeTitle", ""); this._setMessages([]);
      this.set("draftMessage", ""); this.set("canRename", false); this.set("canDelete", false);
      this.set("canAsk", true); this.set("needsReload", false); this.cancelRename();
      var aRows = await this._sessions(fnCurrent);
      if (fnCurrent() && aRows[0]) { await this._select(aRows[0], fnCurrent); }
    }.bind(this));
  };
  ChatState.prototype.dismissContextNotice = function () {
    var sSessionId = this.get("activeSessionId");
    if (sSessionId) { this.dismissedContextNotices[sSessionId] = true; }
    this.set("contextNoticeVisible", false);
  };
  ChatState.prototype.keydown = function (oEvent) {
    if (oEvent.key === "Enter" && !oEvent.shiftKey && !oEvent.isComposing && oEvent.keyCode !== 229) {
      oEvent.preventDefault(); this.send();
    }
  };
  ChatState.prototype.destroy = function () { this.generation += 1; this.model.destroy(); };
  return ChatState;
});
