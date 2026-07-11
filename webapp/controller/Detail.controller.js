sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/Column",
  "sap/m/ColumnListItem",
  "sap/m/MessageToast",
  "sap/m/Text",
  "abap/to/fiori/system/util/formatter",
  "abap/to/fiori/system/util/Constants"
], function (Controller, Column, ColumnListItem, MessageToast, Text, formatter, Constants) {
  "use strict";

  return Controller.extend("abap.to.fiori.system.controller.Detail", {
    formatter: formatter,

    onInit: function () {
      this._oViewModel = this.getOwnerComponent().getModel("view");
      this._oODataService = this.getOwnerComponent().getODataService();
      this.getOwnerComponent().getRouter().getRoute("detail").attachPatternMatched(this._onRouteMatched, this);
    },

    onTabSelect: function (oEvent) {
      var sKey = oEvent.getParameter("key");

      this._oViewModel.setProperty("/detail/selectedTab", sKey);
      this._scrollToSection(sKey);
    },

    onBackToDashboard: function () {
      this.getOwnerComponent().getRouter().navTo("dashboard");
    },

    onExportDetail: function () {
      var sProgramName = this._oViewModel.getProperty("/detail/programName") || "program";
      var oExportData = {
        overview: this._oViewModel.getProperty("/detail/overview") || {},
        businessLogic: this._oViewModel.getProperty("/detail/businessLogic") || [],
        databaseTables: this._oViewModel.getProperty("/detail/databaseTables") || [],
        uiFilters: this._oViewModel.getProperty("/detail/uiFilters") || [],
        comparisonResults: this._oViewModel.getProperty("/detail/comparisonResults") || []
      };
      var sJson = JSON.stringify(oExportData, null, 2);
      var oBlob = new Blob([sJson], {
        type: "application/json;charset=utf-8"
      });
      var sUrl = URL.createObjectURL(oBlob);
      var oLink = document.createElement("a");

      oLink.href = sUrl;
      oLink.download = sProgramName + "_detail.json";
      document.body.appendChild(oLink);
      oLink.click();
      document.body.removeChild(oLink);
      URL.revokeObjectURL(sUrl);

      MessageToast.show("Detail data exported.");
    },

    _onRouteMatched: function (oEvent) {
      var oArguments = oEvent.getParameter("arguments");
      var sEncodedProgramName = oArguments["programName*"] || oArguments.programName || "";
      var sProgramName = decodeURIComponent(sEncodedProgramName);

      this._resetDetailState(sProgramName);
      this._loadOverview(sProgramName);
      this._scrollToSection(Constants.DetailTab.Overview, 0);
    },

    _resetDetailState: function (sProgramName) {
      this._oViewModel.setProperty("/detail/programName", sProgramName);
      this._oViewModel.setProperty("/detail/selectedTab", Constants.DetailTab.Overview);
      this._oViewModel.setProperty("/detail/overview", {});
      this._oViewModel.setProperty("/detail/uiFilters", []);
      this._oViewModel.setProperty("/detail/uiFiltersCount", 0);
      this._oViewModel.setProperty("/detail/databaseTables", []);
      this._oViewModel.setProperty("/detail/databaseTablesCount", 0);
      this._oViewModel.setProperty("/detail/businessLogic", []);
      this._oViewModel.setProperty("/detail/businessLogicCount", 0);
      this._oViewModel.setProperty("/detail/comparisonResults", []);
      this._oViewModel.setProperty("/detail/comparisonResultsCount", 0);
      this._bindComparisonTable([]);
    },

    _loadOverview: function (sProgramName) {
      this._setBusy(true);
      this._oODataService.readProgramDetails(sProgramName)
        .then(function (oProgramDetails) {
          var oOverview = oProgramDetails.overview || {};
          var aBusinessLogic = oProgramDetails.businessLogic || [];
          var aDatabaseTables = oProgramDetails.databaseTables || [];
          var aUIFilters = oProgramDetails.uiFilters || [];
          var aComparisonResults = oProgramDetails.comparisonResults || [];

          this._oViewModel.setProperty("/detail/overview", oOverview);
          this._oViewModel.setProperty("/detail/businessLogic", aBusinessLogic);
          this._oViewModel.setProperty("/detail/businessLogicCount", aBusinessLogic.length);
          this._oViewModel.setProperty("/detail/databaseTables", aDatabaseTables);
          this._oViewModel.setProperty("/detail/databaseTablesCount", aDatabaseTables.length);
          this._oViewModel.setProperty("/detail/uiFilters", aUIFilters);
          this._oViewModel.setProperty("/detail/uiFiltersCount", aUIFilters.length);
          this._oViewModel.setProperty("/detail/comparisonResults", aComparisonResults);
          this._oViewModel.setProperty("/detail/comparisonResultsCount", aComparisonResults.length);
          this._bindComparisonTable(aComparisonResults);

          if (!oOverview.ProgramName) {
            MessageToast.show("No overview data found for " + sProgramName + ".");
          }
        }.bind(this))
        .catch(function (oError) {
          console.error("Error loading detail overview:", oError);
          MessageToast.show("Could not load overview.");
        })
        .finally(function () {
          this._setBusy(false);
        }.bind(this));
    },

    _setBusy: function (bBusy) {
      this._oViewModel.setProperty("/detail/busy", bBusy);
    },

    _scrollToSection: function (sKey, iDuration) {
      var mSectionIds = {};

      mSectionIds[Constants.DetailTab.Overview] = "overviewSection";
      mSectionIds[Constants.DetailTab.BusinessLogic] = "businessLogicSection";
      mSectionIds[Constants.DetailTab.DatabaseTables] = "databaseTablesSection";
      mSectionIds[Constants.DetailTab.UIFilters] = "uiFiltersSection";
      mSectionIds[Constants.DetailTab.ComparisonResults] = "comparisonResultsSection";

      var oSection = this.byId(mSectionIds[sKey]);
      var oSectionDomRef = oSection && oSection.getDomRef();

      if (oSectionDomRef) {
        setTimeout(function () {
          oSectionDomRef.scrollIntoView({
            behavior: iDuration === 0 ? "auto" : "smooth",
            block: "start"
          });
        }, 0);
      }
    },

    _bindComparisonTable: function (aComparisonResults) {
      var oTable = this.byId("comparisonResultsTable");

      if (!oTable) {
        return;
      }

      var aRows = aComparisonResults || [];
      var aColumnKeys = this._getComparisonColumnKeys(aRows);

      oTable.destroyColumns();
      oTable.unbindItems();

      aColumnKeys.forEach(function (sKey) {
        oTable.addColumn(new Column({
          width: this._getComparisonColumnWidth(sKey),
          demandPopin: sKey !== Constants.Field.ProgramName,
          minScreenWidth: "Tablet",
          header: new Text({
            text: this._formatComparisonColumnLabel(sKey)
          })
        }));
      }.bind(this));

      if (!aColumnKeys.length) {
        return;
      }

      oTable.bindItems({
        path: "view>/detail/comparisonResults",
        templateShareable: false,
        template: new ColumnListItem({
          cells: aColumnKeys.map(function (sKey) {
            return new Text({
              wrapping: true,
              text: {
                path: "view>" + sKey,
                formatter: this._formatComparisonCellValue
              }
            });
          }.bind(this))
        })
      });
    },

    _getComparisonColumnKeys: function (aRows) {
      var aPreferredOrder = [
        "ProgramName",
        "ComparisonType",
        "SourceObject",
        "ABAPObject",
        "LegacyObject",
        "TargetObject",
        "FioriObject",
        "MigrationTarget",
        "MatchStatus",
        "ComparisonStatus",
        "Result",
        "SimilarityScore",
        "MatchScore",
        "Score",
        "Difference",
        "DifferenceSummary",
        "Recommendation"
      ];
      var mKeys = {};

      aRows.forEach(function (oRow) {
        Object.keys(oRow || {}).forEach(function (sKey) {
          if (sKey.indexOf("@") !== 0 && sKey !== "$kind") {
            mKeys[sKey] = true;
          }
        });
      });

      var aOrderedKeys = aPreferredOrder.filter(function (sKey) {
        return mKeys[sKey];
      });
      var aRemainingKeys = Object.keys(mKeys).filter(function (sKey) {
        return aOrderedKeys.indexOf(sKey) === -1;
      }).sort();

      return aOrderedKeys.concat(aRemainingKeys);
    },

    _formatComparisonColumnLabel: function (sKey) {
      return String(sKey || "")
        .replace(/_/g, " ")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/\bABAP\b/i, "ABAP")
        .replace(/\bCDS\b/i, "CDS")
        .replace(/\bUI\b/i, "UI");
    },

    _getComparisonColumnWidth: function (sKey) {
      if (sKey === Constants.Field.ProgramName) {
        return "13rem";
      }

      if (/description|difference|recommendation|summary/i.test(sKey)) {
        return "18rem";
      }

      if (/score|status|result|type|priority|severity/i.test(sKey)) {
        return "10rem";
      }

      return "13rem";
    },

    _formatComparisonCellValue: function (vValue) {
      if (vValue === null || vValue === undefined) {
        return "";
      }

      if (typeof vValue === "object") {
        return JSON.stringify(vValue);
      }

      return String(vValue);
    }
  });
});
