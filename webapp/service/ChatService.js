sap.ui.define([
  "sap/ui/model/Filter", "sap/ui/model/FilterOperator", "sap/ui/model/Sorter",
  "abap/to/fiori/system/util/Constants"
], function (Filter, FilterOperator, Sorter, Constants) {
  "use strict";

  var NAMESPACE = Constants.service.namespace;
  var SESSION_FIELDS = "SessionId,AnalysisId,SessionName,Status,CreatedBy,CreatedAt,LastChangedAt,LocalLastChangedAt,__EntityControl,__OperationControl";

  function ChatService(oModel, fnUser) {
    this._model = oModel;
    this._user = fnUser || function () { return ""; };
    this._pendingAsks = Object.create(null);
  }

  ChatService.prototype._id = function (sId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sId || "")) {
      throw new Error("Invalid chat identifier.");
    }
    return sId;
  };

  ChatService.prototype._path = function (sId) {
    return "/ChatSessions(" + this._id(sId) + ")";
  };

  ChatService.prototype._list = async function (sPath, aFilters, aSorters, mParameters, iLimit) {
    var oBinding = this._model.bindList(sPath, undefined, aSorters, aFilters, Object.assign({ $$groupId: "$direct" }, mParameters));
    var aRows = [];
    try {
      // Page through history; never silently truncate a conversation.
      while (true) {
        var iPageSize = iLimit ? Math.min(100, iLimit - aRows.length) : 100;
        var aContexts = await oBinding.requestContexts(aRows.length, iPageSize);
        aRows = aRows.concat(aContexts.map(function (oContext) { return oContext.getObject(); }));
        if (aContexts.length < iPageSize || iLimit && aRows.length >= iLimit) { return aRows; }
      }
    } finally { oBinding.destroy(); }
  };

  ChatService.prototype.listSessions = function (sAnalysisId) {
    var aFilters = [new Filter("AnalysisId", FilterOperator.EQ, this._id(sAnalysisId))];
    var sUser = this._user();
    // This filter is only defense in depth. SAP must enforce ownership on every operation.
    if (sUser) { aFilters.push(new Filter("CreatedBy", FilterOperator.EQ, sUser)); }
    return this._list("/ChatSessions", aFilters, [new Sorter("LastChangedAt", true), new Sorter("SessionId", false)], {
      $select: SESSION_FIELDS
    }).then(async function (aRows) {
      var aSessions = aRows.filter(function (oRow) {
        return String(oRow.AnalysisId).toLowerCase() === sAnalysisId.toLowerCase() && (!sUser || oRow.CreatedBy === sUser);
      });
      // UI5 1.108 rejects $top inside $expand before issuing any HTTP request.
      // Let requestContexts generate top-level $top, with at most four preview reads in flight.
      var iNext = 0;
      var fnWorker = async function () {
        while (iNext < aSessions.length) {
          var oSession = aSessions[iNext++];
          try {
            oSession._Messages = await this._list(this._path(oSession.SessionId) + "/_Messages", [],
              [new Sorter("CreatedAt", true), new Sorter("MessageId", true)],
              { $select: "SessionId,MessageId,Content,CreatedAt" }, 1);
          } catch (oError) {
            // Preview is optional; failure must not prevent opening the session list.
            oSession._Messages = [];
          }
        }
      }.bind(this);
      await Promise.all(Array.from({ length: Math.min(4, aSessions.length) }, fnWorker));
      return aSessions;
    }.bind(this));
  };

  ChatService.prototype._session = async function (sAnalysisId, sSessionId, fnWork) {
    this._id(sAnalysisId);
    var oBinding = this._model.bindContext(this._path(sSessionId), undefined, { $$groupId: "$direct", $$updateGroupId: "$direct" });
    try {
      var oSession = await oBinding.requestObject();
      if (!oSession || String(oSession.AnalysisId).toLowerCase() !== sAnalysisId.toLowerCase() ||
          (this._user() && oSession.CreatedBy !== this._user())) {
        var oError = new Error("Chat session is not accessible.");
        oError.status = 403;
        throw oError;
      }
      return await fnWork(oBinding.getBoundContext(), oSession);
    } finally { oBinding.destroy(); }
  };

  ChatService.prototype.messages = function (sAnalysisId, sSessionId) {
    return this._session(sAnalysisId, sSessionId, function () {
      return this._list(this._path(sSessionId) + "/_Messages", [], [new Sorter("CreatedAt", false), new Sorter("MessageId", false)], {
        $select: "SessionId,MessageId,Role,Content,CreatedAt,AnalysisIdUsed,IsOutdated"
      });
    }.bind(this));
  };

  ChatService.prototype.createSession = function (sAnalysisId, sTitle) {
    var sId = this._id(sAnalysisId);
    var oBinding = this._model.bindList("/ChatSessions", undefined, undefined, undefined, { $$updateGroupId: "$direct" });
    var oContext;
    var oModel = this._model;
    return new Promise(function (resolve, reject) {
      oBinding.attachCreateCompleted(function (oEvent) {
        if (oEvent.getParameter("success")) {
          oContext.created().then(function () { resolve(oContext.getObject()); }, reject);
        } else {
          var aMessages = oModel.getMessages ? oModel.getMessages(oContext) : [];
          var oError = new Error(aMessages.length ? aMessages[0].getMessage() : "Could not create chat session.");
          if (aMessages.length && aMessages[0].getTechnicalDetails) {
            var oDetails = aMessages[0].getTechnicalDetails() || {};
            oError.status = oDetails.httpStatus || oDetails.statusCode;
          }
          // Cancel the transient create so UI5 cannot retry it on a later update.
          oContext.delete("$direct").catch(function () {});
          reject(oError);
        }
      });
      oContext = oBinding.create({ AnalysisId: sId, SessionName: String(sTitle || "").slice(0, 100) }, true);
      oContext.created().catch(reject);
    }).finally(function () { oBinding.destroy(); });
  };

  ChatService.prototype.ask = function (sAnalysisId, sSessionId, sQuestion) {
    var sText = String(sQuestion || "").trim();
    if (!sText || sText.length > 8000) { return Promise.reject(new Error("Question must contain 1–8000 characters.")); }
    if (this._pendingAsks[sSessionId]) { return Promise.reject(new Error("A question is already being processed for this session.")); }
    this._pendingAsks[sSessionId] = true;
    return this._session(sAnalysisId, sSessionId, async function (oContext, oSession) {
      if (oSession.__OperationControl && oSession.__OperationControl.ask === false) {
        var oError = new Error("Chat is not available for this session."); oError.status = 403; throw oError;
      }
      // Keep the loaded session context so UI5 forwards its @odata.etag as If-Match.
      // An absolute operation binding loses that context and SAP rejects ask with 428.
      var oAction = this._model.bindContext(NAMESPACE + ".ask(...)", oContext);
      try {
        oAction.setParameter("Question", sText);
        await oAction.execute("$direct");
        return await oAction.getBoundContext().requestObject();
      } finally { oAction.destroy(); }
    }.bind(this)).finally(function () { delete this._pendingAsks[sSessionId]; }.bind(this));
  };

  ChatService.prototype.rename = function (sAnalysisId, sSessionId, sTitle) {
    var sName = String(sTitle || "").trim();
    if (!sName || sName.length > 100) { return Promise.reject(new Error("Session name must contain 1–100 characters.")); }
    return this._session(sAnalysisId, sSessionId, function (oContext, oSession) {
      if (!oSession.__EntityControl || !oSession.__EntityControl.Updatable) { throw new Error("Session cannot be renamed."); }
      return oContext.setProperty("SessionName", sName, "$direct");
    });
  };

  ChatService.prototype.remove = function (sAnalysisId, sSessionId) {
    return this._session(sAnalysisId, sSessionId, function (oContext, oSession) {
      if (!oSession.__EntityControl || !oSession.__EntityControl.Deletable) { throw new Error("Session cannot be deleted."); }
      return oContext.delete("$direct");
    });
  };

  return ChatService;
});
