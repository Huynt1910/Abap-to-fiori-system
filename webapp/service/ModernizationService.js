sap.ui.define([
  "sap/ui/model/Filter", "sap/ui/model/FilterOperator", "sap/ui/model/Sorter",
  "abap/to/fiori/system/util/Constants"
], function (Filter, FilterOperator, Sorter, Constants) {
  "use strict";
  function guid(value) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || "")) throw new Error("Invalid record ID.");
    return value;
  }
  function Service(model) { this.model = model; }
  Service.prototype.path = function (set, id) { return "/" + set + "(" + guid(id) + ")"; };
  Service.prototype.action = function (path, name, parameters) {
    var binding = this.model.bindContext(path + "/" + Constants.service.namespace + "." + name + "(...)");
    Object.keys(parameters || {}).forEach(function (key) { binding.setParameter(key, parameters[key]); });
    return binding.execute("$direct").then(function () { return binding.getBoundContext().requestObject(); }).finally(function () { binding.destroy(); });
  };
  Service.prototype.assess = function (id) { return this.action(this.path("Analyses", id), "GenerateAIAssessment"); };
  Service.prototype.technicalDocument = function (id) { return this.action(this.path("Analyses", id), "GenerateTechnicalDocument"); };
  Service.prototype.prepareUi = function (id, targetPackage, serviceRoot) {
    if (!targetPackage.trim() || targetPackage.trim().length > 30 || !serviceRoot.trim()) return Promise.reject(new Error("Enter a target package (maximum 30 characters) and service root URL."));
    return this.action(this.path("Analyses", id), "PrepareFioriUi", { TargetPackage: targetPackage.trim(), ServiceRootUrl: serviceRoot.trim() });
  };
  Service.prototype.list = function (set, filterPath, id, skip) {
    var binding = this.model.bindList("/" + set, undefined, [new Sorter("CreatedAt", true)], [new Filter(filterPath, FilterOperator.EQ, guid(id))], { $$groupId: "$direct" });
    return binding.requestContexts(skip || 0, 50).then(function (contexts) { return contexts.map(function (context) { return context.getObject(); }); }).finally(function () { binding.destroy(); });
  };
  Service.prototype.createChat = function (id, name) {
    var binding = this.model.bindList("/ChatSessions", undefined, undefined, undefined, { $$updateGroupId: "$direct" });
    var context = binding.create({
      AnalysisId: guid(id),
      SessionName: String(name || "").trim() || "Migration discussion"
    });

    return context.created()
      .then(function () { return context.requestObject(); })
      .finally(function () { binding.destroy(); });
  };
  Service.prototype.ask = function (id, question) {
    if (!question.trim()) return Promise.reject(new Error("Enter a question."));
    return this.action(this.path("ChatSessions", id), "ask", { Question: question.trim() });
  };
  Service.prototype.changeChat = function (id, name, remove) {
    var binding = this.model.bindContext(this.path("ChatSessions", id), undefined, { $$updateGroupId: "$direct" });
    return binding.requestObject().then(function (data) {
      var context = binding.getBoundContext();
      if (!data.__EntityControl || data.__EntityControl[remove ? "Deletable" : "Updatable"] !== true) throw new Error("SAP does not allow this operation.");
      return remove ? context.delete("$direct") : context.setProperty("SessionName", String(name || "").trim(), "$direct");
    }).finally(function () { binding.destroy(); });
  };
  return Service;
});
