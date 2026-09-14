sap.ui.define([
  "abap/to/fiori/system/controller/BaseController", "sap/ui/model/json/JSONModel",
  "abap/to/fiori/system/service/ModernizationService", "sap/m/MessageBox"
], function (BaseController, JSONModel, ModernizationService, MessageBox) {
  "use strict";
  return BaseController.extend("abap.to.fiori.system.controller.Modernization", {
    onInit: function () {
      this._pendingRequests = 0;
      this.state = new JSONModel({ busy: false, error: "", overview: {}, results: [], package: "", serviceRoot: "", sessions: [], messages: [], jobs: [], sessionId: "", sessionName: "", question: "", moreSessions: false, moreMessages: false, moreJobs: false });
      this.getView().setModel(this.state, "work");
      this.api = new ModernizationService(this.getODataModel());
      this.getRouter().getRoute("modernization").attachPatternMatched(this.onRoute, this);
    },
    onRoute: function (event) {
      this.id = decodeURIComponent(event.getParameter("arguments").analysisId);
      this.state.setProperty("/sessionId", "");
      this.state.setProperty("/sessions", []);
      this.state.setProperty("/messages", []);
      this.state.setProperty("/jobs", []);
      this.state.setProperty("/results", []);
      return this.run(function () {
        return this.getAnalysisService().getAnalysisById(this.id).then(function (data) { this.state.setProperty("/overview", data); }.bind(this));
      }.bind(this)).then(function () {
        return Promise.all([this.onRefreshSessions(), this.onRefreshJobs()]);
      }.bind(this));
    },
    run: function (fn) {
      this._pendingRequests += 1;
      this.state.setProperty("/busy", true);
      this.state.setProperty("/error", "");
      return Promise.resolve().then(fn).catch(function (error) {
        this.state.setProperty("/error", this.parseError(error).message || error.message);
      }.bind(this)).finally(function () {
        this._pendingRequests -= 1;
        this.state.setProperty("/busy", this._pendingRequests > 0);
      }.bind(this));
    },
    showResult: function (result) {
      this.state.setProperty("/results", Object.keys(result || {}).filter(function (key) { return key[0] !== "@"; }).map(function (key) {
        var value = result[key];
        if (/Json$/.test(key) && typeof value === "string") { try { value = JSON.stringify(JSON.parse(value), null, 2); } catch (_) {} }
        return { label: key.replace(/Json$/, "").replace(/([a-z])([A-Z])/g, "$1 $2"), value: typeof value === "object" ? JSON.stringify(value, null, 2) : String(value == null ? "" : value) };
      }));
    },
    onAssess: function () { this.run(function () { return this.api.assess(this.id).then(this.showResult.bind(this)); }.bind(this)); },
    onPrepareUi: function () { this.run(function () { return this.api.prepareUi(this.id, this.state.getProperty("/package"), this.state.getProperty("/serviceRoot")).then(this.showResult.bind(this)); }.bind(this)); },
    onTechnical: function () {
      this.run(function () { return this.api.technicalDocument(this.id).then(function (result) {
        this.showResult(result);
        if (!result.ExportId) throw new Error("SAP did not return an export job ID.");
        return this.getDocumentService().pollExportJob(result.ExportId).then(function (job) { return this.getDocumentService().downloadExportJobContent(job, {}); }.bind(this));
      }.bind(this)); }.bind(this));
    },
    loadList: function (set, filter, id, property, more, append) {
      return this.api.list(set, filter, id, append ? this.state.getProperty(property).length : 0).then(function (rows) {
        this.state.setProperty(property, append ? this.state.getProperty(property).concat(rows) : rows);
        this.state.setProperty(more, rows.length === 50);
      }.bind(this));
    },
    onRefreshSessions: function () { return this.run(function () { return this.loadList("ChatSessions", "AnalysisId", this.id, "/sessions", "/moreSessions", false); }.bind(this)); },
    onMoreSessions: function () { return this.run(function () { return this.loadList("ChatSessions", "AnalysisId", this.id, "/sessions", "/moreSessions", true); }.bind(this)); },
    onCreateSession: function () { this.run(function () { return this.api.createChat(this.id, this.state.getProperty("/sessionName")).then(function (session) { this.state.setProperty("/sessionId", session.SessionId); this.state.setProperty("/selectedSession", session); this.state.setProperty("/messages", []); return this.loadList("ChatSessions", "AnalysisId", this.id, "/sessions", "/moreSessions", false); }.bind(this)); }.bind(this)); },
    onSessionChange: function (event) {
      var session = event.getParameter("listItem").getBindingContext("work").getObject();
      this.state.setProperty("/sessionId", session.SessionId);
      this.state.setProperty("/selectedSession", session);
      this.state.setProperty("/sessionName", session.SessionName);
      this.onRefreshMessages();
    },
    onRefreshMessages: function () { if (this.state.getProperty("/sessionId")) return this.run(function () { return this.loadList("ChatMessages", "SessionId", this.state.getProperty("/sessionId"), "/messages", "/moreMessages", false); }.bind(this)); return Promise.resolve(); },
    onMoreMessages: function () { return this.run(function () { return this.loadList("ChatMessages", "SessionId", this.state.getProperty("/sessionId"), "/messages", "/moreMessages", true); }.bind(this)); },
    onAsk: function () { this.run(function () { return this.api.ask(this.state.getProperty("/sessionId"), this.state.getProperty("/question")).then(function () { this.state.setProperty("/question", ""); return this.loadList("ChatMessages", "SessionId", this.state.getProperty("/sessionId"), "/messages", "/moreMessages", false); }.bind(this)); }.bind(this)); },
    onRenameSession: function () { this.run(function () { return this.api.changeChat(this.state.getProperty("/sessionId"), this.state.getProperty("/sessionName"), false).then(function () { return this.loadList("ChatSessions", "AnalysisId", this.id, "/sessions", "/moreSessions", false); }.bind(this)); }.bind(this)); },
    onDeleteSession: function () { MessageBox.confirm("Delete this chat session?", { onClose: function (action) { if (action === MessageBox.Action.OK) this.run(function () { return this.api.changeChat(this.state.getProperty("/sessionId"), "", true).then(function () { this.state.setProperty("/sessionId", ""); this.state.setProperty("/messages", []); return this.loadList("ChatSessions", "AnalysisId", this.id, "/sessions", "/moreSessions", false); }.bind(this)); }.bind(this)); }.bind(this) }); },
    onRefreshJobs: function () { this.run(function () { return this.loadList("ExportJobs", "AnalysisId", this.id, "/jobs", "/moreJobs", false); }.bind(this)); },
    onMoreJobs: function () { return this.run(function () { return this.loadList("ExportJobs", "AnalysisId", this.id, "/jobs", "/moreJobs", true); }.bind(this)); },
    onDownloadJob: function (event) { var job = event.getSource().getBindingContext("work").getObject(); this.run(function () { return this.getDocumentService().downloadExportJobContent(job, {}); }.bind(this)); },
    onBack: function () { this.getRouter().navTo("analysisDetail", { analysisId: encodeURIComponent(this.id) }); }
  });
});
