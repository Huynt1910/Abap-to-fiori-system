sap.ui.define([
  "sap/ui/core/Fragment",
  "sap/m/MessageBox",
  "abap/to/fiori/system/controller/BaseController",
  "abap/to/fiori/system/model/models",
  "abap/to/fiori/system/model/ComparisonConstants",
  "abap/to/fiori/system/model/ComparisonFormatter"
], function (Fragment, MessageBox, BaseController, models, ComparisonConstants, ComparisonFormatter) {
  "use strict";

  return BaseController.extend("abap.to.fiori.system.controller.ComparisonDetail", {
    comparisonFormatter: ComparisonFormatter,

    onInit: function () {
      this._oViewModel = models.createComparisonUiModel();
      this.getView().setModel(this._oViewModel, "comparisonUi");
      this.getRouter().getRoute(ComparisonConstants.route.detail).attachPatternMatched(this._onRouteMatched, this);
    },

    onExit: function () {
      this.getComparisonService().cancelPolling();
    },

    onBackToHistory: function () {
      this.getRouter().navTo(ComparisonConstants.route.history);
    },

    onRefresh: function () {
      this._loadDetail();
    },

    onItemFilterChange: function () {
      this._loadItems();
    },

    onClearItemFilters: function () {
      this._oViewModel.setProperty("/itemFilters", {
        category: "",
        status: "",
        severity: ""
      });
      this._loadItems();
    },

    onItemPress: function (oEvent) {
      var oContext = (oEvent.getParameter("listItem") || oEvent.getSource()).getBindingContext("comparisonUi");
      var oItem = oContext && oContext.getObject();

      if (!oItem) {
        return;
      }

      this._oViewModel.setProperty("/selectedItem", oItem);
      this._openItemDetailDialog();
    },

    onCloseItemDetail: function () {
      this.byId("comparisonItemDetailDialog").close();
    },

    _onRouteMatched: function (oEvent) {
      var sCmpRunId = decodeURIComponent((oEvent.getParameter("arguments") || {}).cmpRunId || "");
      this._oViewModel.setData(models.createComparisonUiModel().getData());
      this._oViewModel.setProperty("/selectedRunId", sCmpRunId);
      this._loadDetail();
    },

    _loadDetail: function () {
      var sCmpRunId = this._oViewModel.getProperty("/selectedRunId");

      this._oViewModel.setProperty("/busy", true);
      this._oViewModel.setProperty("/errorMessage", "");

      return this.getComparisonService().getComparisonRunById(sCmpRunId)
        .then(function (oRun) {
          this._oViewModel.setProperty("/run", oRun || {});
          return this._loadItems();
        }.bind(this))
        .catch(function (oError) {
          this._oViewModel.setProperty("/errorMessage", this.parseError(oError).message || this.getText("comparisonLoadError"));
        }.bind(this))
        .finally(function () {
          this._oViewModel.setProperty("/busy", false);
        }.bind(this));
    },

    _loadItems: function () {
      var sCmpRunId = this._oViewModel.getProperty("/selectedRunId");

      return this.getComparisonService().getComparisonItems(sCmpRunId, this._oViewModel.getProperty("/itemFilters"))
        .then(function (aItems) {
          this._oViewModel.setProperty("/items", aItems || []);
        }.bind(this))
        .catch(function (oError) {
          this._oViewModel.setProperty("/items", []);
          MessageBox.error(this.parseError(oError).message || this.getText("comparisonItemsLoadError"));
        }.bind(this));
    },

    _openItemDetailDialog: function () {
      if (!this._pItemDetailDialog) {
        this._pItemDetailDialog = Fragment.load({
          id: this.getView().getId(),
          name: "abap.to.fiori.system.view.fragments.ComparisonItemDetail",
          controller: this
        }).then(function (oDialog) {
          this.getView().addDependent(oDialog);
          return oDialog;
        }.bind(this));
      }

      this._pItemDetailDialog.then(function (oDialog) {
        oDialog.open();
      });
    }
  });
});
