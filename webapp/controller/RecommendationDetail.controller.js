sap.ui.define([
  "sap/ui/core/Fragment",
  "sap/ui/model/json/JSONModel",
  "abap/to/fiori/system/controller/BaseController",
  "abap/to/fiori/system/util/formatter"
], function (Fragment, JSONModel, BaseController, formatter) {
  "use strict";

  return BaseController.extend("abap.to.fiori.system.controller.RecommendationDetail", {
    formatter: formatter,

    onInit: function () {
      this._oViewModel = new JSONModel({
        busy: false,
        annotationsBusy: false,
        annotationsLoaded: false,
        analysisId: "",
        recommendationId: "",
        overview: {},
        columns: {
          annotations: { targetEntity: true, targetElement: true, annotationName: true, annotationValue: true, annotationSequence: true }
        },
        annotations: [],
        error: ""
      });
      this.getView().setModel(this._oViewModel, "recDetail");
      this.getRouter().getRoute("recommendationDetail").attachPatternMatched(this._onRouteMatched, this);
    },

    onBackToAnalysis: function () {
      this.getRouter().navTo("analysisDetail", { analysisId: encodeURIComponent(this._oViewModel.getProperty("/analysisId")) });
    },

    onRefresh: function () {
      this._oViewModel.setProperty("/annotationsLoaded", false);
      this._loadOverview().then(this._loadAnnotations.bind(this));
    },

    onOpenSimpleColumnSettings: function () {
      this._mSimpleSettingsSnapshot = Object.assign({}, this._oViewModel.getProperty("/columns/annotations") || {});
      this._ensureSimpleColumnSettingsModel();
      this._prepareSimpleColumnSettings();
      this._openSimpleColumnSettingsDialog();
    },

    onSimpleColumnSettingSelectionChange: function () {
      setTimeout(this._updateSimpleColumnSettingsCount.bind(this), 0);
    },

    onResetSimpleColumnSettings: function () {
      this._getSimpleColumnSettings().forEach(function (oColumn) {
        this._oViewModel.setProperty("/columns/annotations/" + oColumn.key, true);
      }.bind(this));
      this._prepareSimpleColumnSettings();
    },

    onConfirmSimpleColumnSettings: function () {
      this._updateSimpleColumnSettingsCount();
      this._mSimpleSettingsSnapshot = null;
      this.byId("simpleColumnSettingsDialog").close();
    },

    onCancelSimpleColumnSettings: function () {
      if (this._mSimpleSettingsSnapshot) {
        this._oViewModel.setProperty("/columns/annotations", this._mSimpleSettingsSnapshot);
      }
      this._mSimpleSettingsSnapshot = null;
      this.byId("simpleColumnSettingsDialog").close();
    },

    _onRouteMatched: function (oEvent) {
      var oArgs = oEvent.getParameter("arguments") || {};
      this._oViewModel.setProperty("/analysisId", decodeURIComponent(oArgs.analysisId || ""));
      this._oViewModel.setProperty("/recommendationId", decodeURIComponent(oArgs.recommendationId || ""));
      this._oViewModel.setProperty("/annotationsLoaded", false);
      this._loadOverview().then(this._loadAnnotations.bind(this));
    },

    _loadOverview: function () {
      this._oViewModel.setProperty("/busy", true);
      return this.getAnalysisService().getRecommendationById(this._oViewModel.getProperty("/analysisId"), this._oViewModel.getProperty("/recommendationId"))
        .then(function (oData) {
          this._oViewModel.setProperty("/overview", oData || {});
        }.bind(this))
        .catch(function (oError) {
          this.showError(oError, "loadRecommendationsError");
        }.bind(this))
        .finally(function () {
          this._oViewModel.setProperty("/busy", false);
        }.bind(this));
    },

    _loadAnnotations: function () {
      if (this._oViewModel.getProperty("/annotationsLoaded")) {
        return Promise.resolve();
      }
      this._oViewModel.setProperty("/annotationsBusy", true);
      return this.getAnalysisService().getRecommendationAnnotations(this._oViewModel.getProperty("/analysisId"), this._oViewModel.getProperty("/recommendationId"))
        .then(function (aRows) {
          this._oViewModel.setProperty("/annotations", aRows || []);
          this._oViewModel.setProperty("/annotationsLoaded", true);
        }.bind(this))
        .catch(function (oError) {
          this._oViewModel.setProperty("/error", this.parseError(oError).message);
        }.bind(this))
        .finally(function () {
          this._oViewModel.setProperty("/annotationsBusy", false);
        }.bind(this));
    },

    _getSimpleColumnSettings: function () {
      return [
        { key: "targetEntity", label: this.getText("targetEntity") },
        { key: "targetElement", label: this.getText("targetElement") },
        { key: "annotationName", label: this.getText("annotationName") },
        { key: "annotationValue", label: this.getText("annotationValue") },
        { key: "annotationSequence", label: this.getText("annotationSequence") }
      ];
    },

    _prepareSimpleColumnSettings: function () {
      var mColumns = this._oViewModel.getProperty("/columns/annotations") || {};
      var aItems = this._getSimpleColumnSettings().map(function (oColumn) {
        return Object.assign({}, oColumn, { visible: mColumns[oColumn.key] !== false });
      });
      this.getView().getModel("p13n").setData({
        title: this.getText("annotations"),
        items: aItems,
        selectedCount: aItems.filter(function (oColumn) { return oColumn.visible; }).length,
        totalCount: aItems.length
      });
    },

    _updateSimpleColumnSettingsCount: function () {
      var aItems = this.getView().getModel("p13n").getProperty("/items") || [];
      aItems.forEach(function (oColumn) {
        this._oViewModel.setProperty("/columns/annotations/" + oColumn.key, oColumn.visible !== false);
      }.bind(this));
      this.getView().getModel("p13n").setProperty("/selectedCount", aItems.filter(function (oColumn) { return oColumn.visible; }).length);
    },

    _openSimpleColumnSettingsDialog: function () {
      this._ensureSimpleColumnSettingsModel();
      if (!this._pSimpleColumnSettingsDialog) {
        this._pSimpleColumnSettingsDialog = Fragment.load({
          id: this.getView().getId(),
          name: "abap.to.fiori.system.view.fragments.SimpleColumnSettings",
          controller: this
        }).then(function (oDialog) {
          this.getView().addDependent(oDialog);
          return oDialog;
        }.bind(this));
      }
      this._pSimpleColumnSettingsDialog.then(function (oDialog) {
        oDialog.open();
      });
    },

    _ensureSimpleColumnSettingsModel: function () {
      if (!this.getView().getModel("p13n")) {
        this.getView().setModel(new JSONModel({}), "p13n");
      }
    }
  });
});
