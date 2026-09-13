sap.ui.define(
  [
    "sap/ui/core/Fragment",
    "sap/ui/core/routing/HashChanger",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "sap/m/MessageToast",
    "abap/to/fiori/system/controller/BaseController",
    "abap/to/fiori/system/model/models",
    "abap/to/fiori/system/util/Constants",
    "abap/to/fiori/system/util/formatter",
  ],
  function (
    Fragment,
    HashChanger,
    Filter,
    FilterOperator,
    Sorter,
    MessageToast,
    BaseController,
    models,
    Constants,
    formatter,
  ) {
    "use strict";

    return BaseController.extend("abap.to.fiori.system.controller.Dashboard", {
      formatter: formatter,

      onInit: function () {
        this._oViewModel = models.createDashboardModel();
        this.getView().setModel(this._oViewModel, "dashboard");
        this._applyAnalysisFilters();
        this._updateDashboardKpis();
        this._displayMailTargetFromHash();
      },

      onSearch: function () {
        this._applyAnalysisFilters();
      },

      onRefresh: function () {
        this._refreshAnalyses();
      },

      onOpenMailJobs: function () {
        this._displayMailJobs();
      },

      onOpenComparisonHistory: function () {
        this.getRouter().navTo("comparisonHistory");
      },

      onClearFilters: function () {
        this._oViewModel.setProperty("/filters/search", "");
        this._oViewModel.setProperty("/filters/status", "");
        this._applyAnalysisFilters();
      },

      onExit: function () {
        if (this._iProgramValueHelpSearchTimer) {
          clearTimeout(this._iProgramValueHelpSearchTimer);
        }
      },

      onOpenAnalysisTableSettings: function () {
        this._mAnalysisColumnSnapshot = Object.assign(
          {},
          this._oViewModel.getProperty("/columns") || {},
        );
        this._prepareAnalysisTableSettings();
        this._openAnalysisTableSettingsDialog();
      },

      onSearchAnalysisTableSettings: function (oEvent) {
        this._filterTableSettingsList(
          "analysisTableSettingsList",
          oEvent.getParameter("newValue"),
        );
      },

      onAnalysisTableSettingSelectionChange: function () {
        setTimeout(this._updateAnalysisTableSettingsCount.bind(this), 0);
      },

      onResetAnalysisTableSettings: function () {
        this._getAnalysisColumnSettings().forEach(
          function (oColumn) {
            this._oViewModel.setProperty(
              "/columns/" + oColumn.key,
              oColumn.defaultVisible,
            );
          }.bind(this),
        );
        this._prepareAnalysisTableSettings();
      },

      onConfirmAnalysisTableSettings: function () {
        this._updateAnalysisTableSettingsCount();
        this._mAnalysisColumnSnapshot = null;
        this.byId("analysisTableSettingsDialog").close();
      },

      onCancelAnalysisTableSettings: function () {
        if (this._mAnalysisColumnSnapshot) {
          this._oViewModel.setProperty(
            "/columns",
            this._mAnalysisColumnSnapshot,
          );
        }
        this._mAnalysisColumnSnapshot = null;
        this.byId("analysisTableSettingsDialog").close();
      },

      onAnalysesUpdateFinished: function (oEvent) {
        var iTotal = oEvent.getParameter("total") || 0;
        this._oViewModel.setProperty("/visibleCount", iTotal);
        this._updateDashboardKpis();
      },

      onRunAnalysis: function () {
        this._resetRunAnalysisState();
        this._openRunAnalysisDialog();
      },

      onCancelRunAnalysis: function () {
        this.byId("runAnalysisDialog").close();
      },

      onExecuteRunAnalysis: function () {
        var sProgramName = String(
          this._oViewModel.getProperty("/newAnalysis/programName") || "",
        ).trim();

        if (!sProgramName) {
          MessageToast.show(this.getText("validationProgramNameRequired"));
          return;
        }
        if (sProgramName.length > Constants.field.programNameMaxLength) {
          MessageToast.show(this.getText("validationProgramNameMaxLength"));
          return;
        }

        this._oViewModel.setProperty("/newAnalysis/busy", true);
        this.getAnalysisService()
          .analyzeProgram(sProgramName)
          .then(
            function (oAnalysis) {
              var sAnalysisId = oAnalysis && oAnalysis.AnalysisId;

              this.byId("runAnalysisDialog").close();
              MessageToast.show(this.getText("runAnalysisSuccess"));
              this._refreshAnalyses();

              if (sAnalysisId) {
                this.getRouter().navTo("analysisDetail", {
                  analysisId: sAnalysisId,
                });
              }
            }.bind(this),
          )
          .catch(
            function (oError) {
              this.showError(oError, "runAnalysisError");
            }.bind(this),
          )
          .finally(
            function () {
              this._oViewModel.setProperty("/newAnalysis/busy", false);
            }.bind(this),
          );
      },

      onProgramNameChange: function (oEvent) {
        this._oViewModel.setProperty(
          "/newAnalysis/programName",
          this._normalizeProgramName(oEvent.getParameter("value")),
        );
      },

      onProgramValueHelpRequest: function () {
        this._oViewModel.setProperty(
          "/newAnalysis/valueHelp/search",
          this._oViewModel.getProperty("/newAnalysis/programName") || "",
        );
        this._oViewModel.setProperty("/newAnalysis/valueHelp/errorMessage", "");
        this._openProgramValueHelpDialog();
        this._loadProgramValueHelp(0);
      },

      onProgramValueHelpSearch: function (oEvent) {
        var sSearch = this._normalizeProgramName(
          oEvent.getParameter("newValue") || oEvent.getParameter("query"),
        );

        this._oViewModel.setProperty("/newAnalysis/valueHelp/search", sSearch);
        this._loadProgramValueHelp(250);
      },

      onProgramValueHelpSelectionChange: function (oEvent) {
        var oItem = oEvent.getParameter("listItem");
        var oContext = oItem && oItem.getBindingContext("dashboard");
        var oProgram = oContext && oContext.getObject();

        if (oProgram && oProgram.ProgramName) {
          this._oViewModel.setProperty(
            "/newAnalysis/programName",
            oProgram.ProgramName,
          );
        }
      },

      onConfirmProgramValueHelp: function () {
        this.byId("programValueHelpDialog").close();
      },

      onCancelProgramValueHelp: function () {
        this.byId("programValueHelpDialog").close();
      },

      onAnalysisPress: function (oEvent) {
        var oListItem = oEvent.getParameter("listItem") || oEvent.getSource();
        var oContext = oListItem && oListItem.getBindingContext();
        var sAnalysisId = oContext && oContext.getProperty("AnalysisId");

        if (!sAnalysisId) {
          MessageToast.show(this.getText("openAnalysisError"));
          return;
        }

        this.getRouter().navTo("analysisDetail", {
          analysisId: encodeURIComponent(sAnalysisId),
        });
      },

      _applyAnalysisFilters: function () {
        var oTable = this.byId("analysisTable");
        var oBinding = oTable && oTable.getBinding("items");
        var aFilters = this._buildFilters();

        if (oBinding) {
          oBinding.filter(aFilters);
          oBinding.sort([new Sorter(Constants.field.createdAt, true)]);
        }
        this._updateDashboardKpis();
      },

      _refreshAnalyses: function () {
        var oBinding = this.byId("analysisTable").getBinding("items");

        this._applyAnalysisFilters();

        // if (oBinding) {
        //   oBinding.refresh();
        // }
      },

      _buildFilters: function () {
        var aFilters = [];
        var sSearch = String(
          this._oViewModel.getProperty("/filters/search") || "",
        ).trim();
        var sStatus = String(
          this._oViewModel.getProperty("/filters/status") || "",
        ).trim();

        if (sSearch) {
          aFilters.push(
            new Filter(
              Constants.field.programName,
              FilterOperator.Contains,
              sSearch,
            ),
          );
        }

        if (sStatus) {
          aFilters.push(
            new Filter(Constants.field.status, FilterOperator.EQ, sStatus),
          );
        }

        return aFilters;
      },

      _updateDashboardKpis: function () {
        this._oViewModel.setProperty("/busy", true);
        this.getAnalysisService()
          .readAnalysisSummary()
          .then(
            function (oKpi) {
              this._oViewModel.setProperty("/kpi", oKpi);
            }.bind(this),
          )
          .catch(
            function (oError) {
              this.showError(oError, "loadOverviewError");
            }.bind(this),
          )
          .finally(
            function () {
              this._oViewModel.setProperty("/busy", false);
            }.bind(this),
          );
      },

      _displayMailTargetFromHash: function () {
        var sHash = HashChanger.getInstance().getHash();

        if (/^\/?mail($|\/)/.test(sHash)) {
          setTimeout(
            function () {
              this._displayMailJobs(true);
            }.bind(this),
            0,
          );
        }
      },

      _displayMailJobs: function (bKeepHash) {
        var vDisplayResult;

        try {
          vDisplayResult = this.getRouter().getTargets().display("mailJobs");

          if (vDisplayResult && typeof vDisplayResult.catch === "function") {
            vDisplayResult.catch(
              function (oError) {
                this.showError(oError, "openMailJobsError");
              }.bind(this),
            );
          }

          if (!bKeepHash) {
            HashChanger.getInstance().setHash("mail");
          }
        } catch (oError) {
          this.showError(oError, "openMailJobsError");
        }
      },

      _getAnalysisColumnSettings: function () {
        return [
          {
            key: "program",
            label: this.getText("rootProgram"),
            defaultVisible: true,
          },
          {
            key: "status",
            label: this.getText("analysisStatus"),
            defaultVisible: true,
          },
          {
            key: "sourceObjects",
            label: this.getText("sourceObjects"),
            defaultVisible: true,
          },
          {
            key: "dbTables",
            label: this.getText("dbTables"),
            defaultVisible: true,
          },
          {
            key: "alvOutputs",
            label: this.getText("alvOutputs"),
            defaultVisible: true,
          },
          {
            key: "readinessScore",
            label: this.getText("readinessScore"),
            defaultVisible: true,
          },
          {
            key: "createdAt",
            label: this.getText("createdAt"),
            defaultVisible: true,
          },
          {
            key: "createdBy",
            label: this.getText("createdBy"),
            defaultVisible: true,
          },
        ];
      },

      _prepareAnalysisTableSettings: function () {
        var mColumns = this._oViewModel.getProperty("/columns") || {};
        var aItems = this._getAnalysisColumnSettings().map(function (oColumn) {
          return Object.assign({}, oColumn, {
            visible: mColumns[oColumn.key] !== false,
          });
        });

        this._oViewModel.setProperty("/tableSettings", {
          items: aItems,
          selectedCount: aItems.filter(function (oColumn) {
            return oColumn.visible;
          }).length,
          totalCount: aItems.length,
        });
      },

      _updateAnalysisTableSettingsCount: function () {
        var aItems = this._oViewModel.getProperty("/tableSettings/items") || [];

        aItems.forEach(
          function (oColumn) {
            this._oViewModel.setProperty(
              "/columns/" + oColumn.key,
              oColumn.visible !== false,
            );
          }.bind(this),
        );
        this._oViewModel.setProperty(
          "/tableSettings/selectedCount",
          aItems.filter(function (oColumn) {
            return oColumn.visible;
          }).length,
        );
      },

      _filterTableSettingsList: function (sListId, sSearch) {
        var oList = this.byId(sListId);
        var oBinding = oList && oList.getBinding("items");
        var sValue = String(sSearch || "").trim();

        if (oBinding) {
          oBinding.filter(
            sValue
              ? [new Filter("label", FilterOperator.Contains, sValue)]
              : [],
          );
        }
      },

      _openAnalysisTableSettingsDialog: function () {
        if (!this._pAnalysisTableSettingsDialog) {
          this._pAnalysisTableSettingsDialog = Fragment.load({
            id: this.getView().getId(),
            name: "abap.to.fiori.system.view.fragments.AnalysisTableSettings",
            controller: this,
          }).then(
            function (oDialog) {
              this.getView().addDependent(oDialog);
              return oDialog;
            }.bind(this),
          );
        }

        this._pAnalysisTableSettingsDialog.then(
          function (oDialog) {
            this._filterTableSettingsList("analysisTableSettingsList", "");
            oDialog.open();
          }.bind(this),
        );
      },

      _openRunAnalysisDialog: function () {
        if (!this._pRunAnalysisDialog) {
          this._pRunAnalysisDialog = Fragment.load({
            id: this.getView().getId(),
            name: "abap.to.fiori.system.view.fragments.RunAnalysisDialog",
            controller: this,
          }).then(
            function (oDialog) {
              this.getView().addDependent(oDialog);
              return oDialog;
            }.bind(this),
          );
        }

        this._pRunAnalysisDialog.then(function (oDialog) {
          oDialog.open();
        });
      },

      _openProgramValueHelpDialog: function () {
        if (!this._pProgramValueHelpDialog) {
          this._pProgramValueHelpDialog = Fragment.load({
            id: this.getView().getId(),
            name: "abap.to.fiori.system.view.fragments.ProgramValueHelpDialog",
            controller: this,
          }).then(
            function (oDialog) {
              this.getView().addDependent(oDialog);
              return oDialog;
            }.bind(this),
          );
        }

        this._pProgramValueHelpDialog.then(function (oDialog) {
          oDialog.open();
        });
      },

      _loadProgramValueHelp: function (iDelay) {
        if (this._iProgramValueHelpSearchTimer) {
          clearTimeout(this._iProgramValueHelpSearchTimer);
        }

        this._iProgramValueHelpSearchTimer = setTimeout(
          function () {
            var sSearch = this._oViewModel.getProperty(
              "/newAnalysis/valueHelp/search",
            );

            this._oViewModel.setProperty("/newAnalysis/valueHelp/busy", true);
            this._oViewModel.setProperty(
              "/newAnalysis/valueHelp/errorMessage",
              "",
            );
            this.getProgramValueHelpService()
              .searchPrograms(sSearch, 50)
              .then(
                function (aPrograms) {
                  this._oViewModel.setProperty(
                    "/newAnalysis/valueHelp/items",
                    aPrograms,
                  );
                }.bind(this),
              )
              .catch(
                function (oError) {
                  this._oViewModel.setProperty(
                    "/newAnalysis/valueHelp/items",
                    [],
                  );
                  this._oViewModel.setProperty(
                    "/newAnalysis/valueHelp/errorMessage",
                    this.parseError(oError).message ||
                      this.getText("programValueHelpLoadError"),
                  );
                }.bind(this),
              )
              .finally(
                function () {
                  this._oViewModel.setProperty(
                    "/newAnalysis/valueHelp/busy",
                    false,
                  );
                }.bind(this),
              );
          }.bind(this),
          iDelay || 0,
        );
      },

      _normalizeProgramName: function (sValue) {
        return String(sValue || "")
          .trim()
          .toUpperCase()
          .slice(0, Constants.field.programNameMaxLength);
      },

      _resetRunAnalysisState: function () {
        this._oViewModel.setProperty("/newAnalysis/programName", "");
        this._oViewModel.setProperty("/newAnalysis/busy", false);
        this._oViewModel.setProperty("/newAnalysis/valueHelp", {
          busy: false,
          search: "",
          errorMessage: "",
          items: [],
        });
      },
    });
  },
);
