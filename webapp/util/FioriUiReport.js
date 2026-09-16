sap.ui.define([
  "sap/ui/model/odata/v4/ODataModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/model/Sorter",
  "sap/m/Dialog",
  "sap/m/VBox",
  "sap/m/HBox",
  "sap/m/Label",
  "sap/m/Input",
  "sap/m/Button",
  "sap/m/MessageStrip",
  "sap/m/Text",
  "sap/m/Column",
  "sap/m/ColumnListItem",
  "sap/m/Table",
  "abap/to/fiori/system/util/FioriUiReportConfig"
], function (ODataModel, Filter, FilterOperator, Sorter, Dialog, VBox, HBox, Label, Input,
  Button, MessageStrip, Text, Column, ColumnListItem, Table, ReportConfig) {
  "use strict";

  function resourceUrl(sServiceUrl, sResource) {
    var iQuery = sServiceUrl.indexOf("?");
    return (iQuery < 0 ? sServiceUrl : sServiceUrl.slice(0, iQuery)) + sResource +
      (iQuery < 0 ? "" : sServiceUrl.slice(iQuery));
  }

  function requestError(oError, sUrl) {
    var sMessage = oError && oError.message || String(oError);
    var oResponse = oError && oError.response;
    var vStatus = oError && (oError.status || oError.statusCode) ||
      oResponse && (oResponse.status || oResponse.statusCode);
    var aStatus = !vStatus && /\b([1-5][0-9]{2})\b/.exec(sMessage);
    return new Error("HTTP " + (vStatus || aStatus && aStatus[1] || "không có phản hồi") +
      " tại " + sUrl + ": " + sMessage);
  }

  function open(oOwner, sServiceUrl, oConfig, fnIsCurrent) {
    var bClosed = false;
    function t(sKey, aArgs) { return oOwner.getText(sKey, aArgs); }
    var sEntitySet = ReportConfig.entitySet(oConfig);
    var sMetadataUrl = resourceUrl(sServiceUrl, "$metadata");
    var sDataUrl = resourceUrl(sServiceUrl, sEntitySet);
    var oModel = new ODataModel({
      serviceUrl: sServiceUrl,
      synchronizationMode: "None",
      operationMode: "Server",
      groupId: "$direct",
      updateGroupId: "$direct",
      autoExpandSelect: true
    });
    var oStatus = new Text({ text: t("fioriUiReportReadingMetadata") });
    var oError = new MessageStrip({ type: "Error", showIcon: true, visible: false });
    var oContent = new VBox({ width: "100%", items: [oStatus, oError] });
    var oDialog = new Dialog({
      title: t("fioriUiOpenReportButton"),
      contentWidth: "90%",
      contentHeight: "75%",
      stretchOnPhone: true,
      resizable: true,
      draggable: true,
      content: [oContent]
    });
    function active() { return !bClosed && fnIsCurrent(); }
    function showError(oFailure) {
      if (!active()) { return; }
      oError.setText(t("fioriUiReportLoadError", [oFailure && oFailure.message || String(oFailure)]));
      oError.setVisible(true);
      oStatus.setText(t("fioriUiReportRequestFailed"));
    }
    function close() {
      if (bClosed) { return; }
      bClosed = true;
      oDialog.close();
    }
    oDialog.setEndButton(new Button({ text: t("close"), press: close }));
    oDialog.attachBeforeClose(function () { bClosed = true; });
    oDialog.attachAfterClose(function () {
      oDialog.destroy();
      oModel.destroy();
    });
    oOwner.getView().addDependent(oDialog);
    oDialog.setModel(oModel, "report");
    oDialog.open();

    Promise.resolve().then(function () {
      var oMetaModel = oModel.getMetaModel();
      return oMetaModel.requestObject("/$EntityContainer/").catch(function (oError) {
        throw requestError(oError, sMetadataUrl);
      }).then(function (oContainer) {
        if (!active()) { return; }
        // The container lists the actual EntitySets; a trailing slash on the set resolves its EntityType.
        if (!oContainer || !oContainer[sEntitySet] || oContainer[sEntitySet].$kind !== "EntitySet") {
          ReportConfig.select(oConfig, { container: oContainer }, sServiceUrl);
        }
        return Promise.all([
          oMetaModel.requestObject("/" + sEntitySet + "/"),
          oMetaModel.requestObject("/" + sEntitySet + "/@com.sap.vocabularies.UI.v1.LineItem"),
          oMetaModel.requestObject("/" + sEntitySet + "@com.sap.vocabularies.UI.v1.LineItem")
        ]).catch(function (oError) {
          throw requestError(oError, sMetadataUrl);
        }).then(function (aValues) {
          return { container: oContainer, type: aValues[0], lineItem: aValues[1] || aValues[2] };
        });
      });
    }).then(function (oRuntime) {
      if (!active()) { return; }
      var oSelection = ReportConfig.select(oConfig, oRuntime, sServiceUrl);
      if (!active()) { return; }
      var oFilters = new HBox({ wrap: "Wrap", alignItems: "End", items: [] });
      var aInputs = [];
      oSelection.filters.forEach(function (oFilter) {
        if (!oFilter.supported) { return; }
        var oInput = new Input({ width: "12rem", placeholder: oFilter.property });
        oFilters.addItem(new VBox({
          items: [new Label({ text: oFilter.label + " (" + oFilter.property + ")", labelFor: oInput }), oInput]
        }).addStyleClass("sapUiSmallMarginEnd sapUiSmallMarginBottom"));
        aInputs.push({ property: oFilter.property, input: oInput });
      });
      var aUnsupported = oSelection.filters.filter(function (oFilter) { return !oFilter.supported; });
      if (aUnsupported.length) {
        oContent.addItem(new MessageStrip({
          text: aUnsupported.map(function (oFilter) { return oFilter.reason; }).join(" "),
          type: "Warning", showIcon: true
        }).addStyleClass("sapUiSmallMarginTop"));
      }
      var oTable = new Table({
        width: "100%",
        growing: true,
        growingThreshold: 30,
        growingScrollToLoad: false,
        growingTriggerText: t("fioriUiReportLoadMore"),
        busyIndicatorDelay: 0,
        noDataText: t("fioriUiReportNoData"),
        columns: oSelection.columns.map(function (oColumn) {
          return new Column({ header: new Text({ text: oColumn.label }) });
        }),
        updateFinished: function () {
          if (active() && !oError.getVisible()) {
            oStatus.setText(t("fioriUiReportLoaded", [oTable.getItems().length, oSelection.entitySet]));
          }
        }
      });
      var oTemplate = new ColumnListItem({
        cells: oSelection.columns.map(function (oColumn) {
          return new Text({ text: { path: "report>" + oColumn.property }, wrapping: false });
        })
      });
      oFilters.addItem(new Button({
        text: t("fioriUiReportSearch"),
        type: "Emphasized",
        press: function () {
          if (!active()) { return; }
          var aServerFilters = aInputs.filter(function (oEntry) {
            return oEntry.input.getValue() !== "";
          }).map(function (oEntry) {
            return new Filter(oEntry.property, FilterOperator.EQ, oEntry.input.getValue());
          });
          oError.setVisible(false);
          oStatus.setText(t("fioriUiReportSearching"));
          oTable.getBinding("items").filter(aServerFilters, "Application");
        }
      }).addStyleClass("sapUiSmallMarginBottom"));
      oContent.addItem(oFilters.addStyleClass("sapUiSmallMarginTop"));
      oContent.addItem(oTable);
      var aSorters = oSelection.defaultSort.map(function (oSort) {
        return new Sorter(oSort.property, oSort.descending);
      });
      oTable.bindItems({
        path: "report>/" + oSelection.entitySet,
        template: oTemplate,
        sorter: aSorters,
        events: {
          dataRequested: function () {
            if (!active()) { return; }
            oError.setVisible(false);
            oTable.setBusy(true);
            oStatus.setText(t("fioriUiReportLoadingData"));
          },
          dataReceived: function (oEvent) {
            if (!active()) { return; }
            oTable.setBusy(false);
            var oRequestError = oEvent.getParameter("error");
            if (oRequestError) { showError(requestError(oRequestError, sDataUrl)); }
          }
        }
      });
    }).catch(showError);

    return { close: close };
  }

  return { open: open };
});
