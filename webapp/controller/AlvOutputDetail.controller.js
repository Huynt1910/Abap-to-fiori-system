sap.ui.define([
  "sap/ui/core/Fragment",
  "sap/ui/model/json/JSONModel",
  "abap/to/fiori/system/controller/BaseController",
  "abap/to/fiori/system/util/formatter"
], function (Fragment, JSONModel, BaseController, formatter) {
  "use strict";

  return BaseController.extend("abap.to.fiori.system.controller.AlvOutputDetail", {
    formatter: formatter,

    onInit: function () {
      this._oViewModel = new JSONModel({
        busy: false,
        loading: { alvColumns: false, alvSorts: false, alvFilters: false, alvEvents: false },
        loaded: { alvColumns: false, alvSorts: false, alvFilters: false, alvEvents: false },
        errors: {},
        analysisId: "",
        outputId: "",
        overview: {},
        columns: {
          alvColumns: { fieldName: true, columnLabel: true, columnPosition: true, dataType: true, dataElement: true, visible: true, confidence: true },
          alvSorts: { fieldName: true, sortPosition: true, isAscending: true, isDescending: true, subtotal: true, confidence: true },
          alvFilters: { fieldName: true, filterSign: true, filterOption: true, lowValue: true, highValue: true, confidence: true },
          alvEvents: { eventName: true, handlerName: true, handlerKind: true, controlObject: true, guiDependency: true, confidence: true }
        },
        alvColumns: [],
        alvSorts: [],
        alvFilters: [],
        alvEvents: []
      });
      this.getView().setModel(this._oViewModel, "alvDetail");
      this.getRouter().getRoute("alvOutputDetail").attachPatternMatched(this._onRouteMatched, this);
    },

    onBackToAnalysis: function () {
      this.getRouter().navTo("analysisDetail", { analysisId: encodeURIComponent(this._oViewModel.getProperty("/analysisId")) });
    },

    onRefresh: function () {
      this._oViewModel.setProperty("/loaded", { alvColumns: false, alvSorts: false, alvFilters: false, alvEvents: false });
      this._loadAll();
    },

    onOpenSimpleColumnSettings: function (oEvent) {
      var sSection = oEvent.getSource().data("section");
      this._sSimpleSettingsSection = sSection;
      this._mSimpleSettingsSnapshot = Object.assign({}, this._oViewModel.getProperty("/columns/" + sSection) || {});
      this._ensureSimpleColumnSettingsModel();
      this._prepareSimpleColumnSettings(sSection);
      this._openSimpleColumnSettingsDialog();
    },

    onSimpleColumnSettingSelectionChange: function () {
      setTimeout(this._updateSimpleColumnSettingsCount.bind(this), 0);
    },

    onResetSimpleColumnSettings: function () {
      this._getSimpleColumnSettings(this._sSimpleSettingsSection).forEach(function (oColumn) {
        this._oViewModel.setProperty("/columns/" + this._sSimpleSettingsSection + "/" + oColumn.key, true);
      }.bind(this));
      this._prepareSimpleColumnSettings(this._sSimpleSettingsSection);
    },

    onConfirmSimpleColumnSettings: function () {
      this._updateSimpleColumnSettingsCount();
      this._mSimpleSettingsSnapshot = null;
      this.byId("simpleColumnSettingsDialog").close();
    },

    onCancelSimpleColumnSettings: function () {
      if (this._sSimpleSettingsSection && this._mSimpleSettingsSnapshot) {
        this._oViewModel.setProperty("/columns/" + this._sSimpleSettingsSection, this._mSimpleSettingsSnapshot);
      }
      this._mSimpleSettingsSnapshot = null;
      this.byId("simpleColumnSettingsDialog").close();
    },

    _onRouteMatched: function (oEvent) {
      var oArgs = oEvent.getParameter("arguments") || {};
      this._oViewModel.setProperty("/analysisId", decodeURIComponent(oArgs.analysisId || ""));
      this._oViewModel.setProperty("/outputId", decodeURIComponent(oArgs.outputId || ""));
      this._oViewModel.setProperty("/loaded", { alvColumns: false, alvSorts: false, alvFilters: false, alvEvents: false });
      this._loadAll();
    },

    _loadAll: function () {
      return this._loadOverview().then(function () {
        return Promise.all([
          this._loadChild("alvColumns"),
          this._loadChild("alvSorts"),
          this._loadChild("alvFilters"),
          this._loadChild("alvEvents")
        ]);
      }.bind(this));
    },

    _loadOverview: function () {
      this._oViewModel.setProperty("/busy", true);
      return this.getAnalysisService().getAlvOutputById(this._oViewModel.getProperty("/analysisId"), this._oViewModel.getProperty("/outputId"))
        .then(function (oData) {
          this._oViewModel.setProperty("/overview", oData || {});
        }.bind(this))
        .catch(function (oError) {
          this.showError(oError, "loadAlvOutputsError");
        }.bind(this))
        .finally(function () {
          this._oViewModel.setProperty("/busy", false);
        }.bind(this));
    },

    _loadChild: function (sKey) {
      if (this._oViewModel.getProperty("/loaded/" + sKey)) {
        return Promise.resolve();
      }
      this._oViewModel.setProperty("/loading/" + sKey, true);
      this._oViewModel.setProperty("/errors/" + sKey, "");
      return this.getAnalysisService().getAlvOutputChildren(
        this._oViewModel.getProperty("/analysisId"),
        this._oViewModel.getProperty("/outputId"),
        sKey
      ).then(function (aRows) {
        this._oViewModel.setProperty("/" + sKey, aRows || []);
        this._oViewModel.setProperty("/loaded/" + sKey, true);
      }.bind(this)).catch(function (oError) {
        this._oViewModel.setProperty("/errors/" + sKey, this.parseError(oError).message);
      }.bind(this)).finally(function () {
        this._oViewModel.setProperty("/loading/" + sKey, false);
      }.bind(this));
    },

    _getSimpleColumnSettings: function (sSection) {
      var mSettings = {
        alvColumns: [
          { key: "fieldName", label: this.getText("fieldName") },
          { key: "columnLabel", label: this.getText("columnLabel") },
          { key: "columnPosition", label: this.getText("columnPosition") },
          { key: "dataType", label: this.getText("dataType") },
          { key: "dataElement", label: this.getText("dataElement") },
          { key: "visible", label: this.getText("visible") },
          { key: "confidence", label: this.getText("confidence") }
        ],
        alvSorts: [
          { key: "fieldName", label: this.getText("fieldName") },
          { key: "sortPosition", label: this.getText("sortPosition") },
          { key: "isAscending", label: this.getText("isAscending") },
          { key: "isDescending", label: this.getText("isDescending") },
          { key: "subtotal", label: this.getText("subtotal") },
          { key: "confidence", label: this.getText("confidence") }
        ],
        alvFilters: [
          { key: "fieldName", label: this.getText("fieldName") },
          { key: "filterSign", label: this.getText("filterSign") },
          { key: "filterOption", label: this.getText("filterOption") },
          { key: "lowValue", label: this.getText("lowValue") },
          { key: "highValue", label: this.getText("highValue") },
          { key: "confidence", label: this.getText("confidence") }
        ],
        alvEvents: [
          { key: "eventName", label: this.getText("eventName") },
          { key: "handlerName", label: this.getText("handlerName") },
          { key: "handlerKind", label: this.getText("handlerKind") },
          { key: "controlObject", label: this.getText("controlObject") },
          { key: "guiDependency", label: this.getText("guiDependency") },
          { key: "confidence", label: this.getText("confidence") }
        ]
      };
      return mSettings[sSection] || [];
    },

    _prepareSimpleColumnSettings: function (sSection) {
      var mColumns = this._oViewModel.getProperty("/columns/" + sSection) || {};
      var aItems = this._getSimpleColumnSettings(sSection).map(function (oColumn) {
        return Object.assign({}, oColumn, { visible: mColumns[oColumn.key] !== false });
      });
      this.getView().getModel("p13n").setData({
        title: this.getText(sSection),
        items: aItems,
        selectedCount: aItems.filter(function (oColumn) { return oColumn.visible; }).length,
        totalCount: aItems.length
      });
    },

    _updateSimpleColumnSettingsCount: function () {
      var aItems = this.getView().getModel("p13n").getProperty("/items") || [];
      aItems.forEach(function (oColumn) {
        this._oViewModel.setProperty("/columns/" + this._sSimpleSettingsSection + "/" + oColumn.key, oColumn.visible !== false);
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
