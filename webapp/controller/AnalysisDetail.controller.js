sap.ui.define([
  "sap/ui/core/Fragment",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "abap/to/fiori/system/controller/BaseController",
  "abap/to/fiori/system/model/models",
  "abap/to/fiori/system/util/Constants",
  "abap/to/fiori/system/util/formatter"
], function (Fragment, MessageBox, MessageToast, BaseController, models, Constants, formatter) {
  "use strict";

  return BaseController.extend("abap.to.fiori.system.controller.AnalysisDetail", {
    formatter: formatter,

    onInit: function () {
      this._oViewModel = models.createAnalysisDetailModel();
      this._mTabFragments = {};
      this.getView().setModel(this._oViewModel, "detail");
      this.getRouter().getRoute("analysisDetail").attachPatternMatched(this._onRouteMatched, this);
      this.getRouter().getRoute("detail").attachPatternMatched(this._onRouteMatched, this);
    },

    onBackToDashboard: function () {
      this.getRouter().navTo("dashboard");
    },

    onTabSelect: function (oEvent) {
      var sTabKey = oEvent.getParameter("key");

      if (sTabKey) {
        this._oViewModel.setProperty("/selectedTab", sTabKey);
        this._showTab(sTabKey);
      }
    },

    onRefresh: function () {
      var sSelectedTab = this._oViewModel.getProperty("/selectedTab");

      this._resetLoadedState();
      this._loadOverview().then(function () {
        return this._showTab(sSelectedTab);
      }.bind(this));
    },

    onReanalyze: function () {
      MessageBox.confirm(this.getText("reanalyzeConfirm"), {
        actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
        emphasizedAction: MessageBox.Action.OK,
        onClose: function (sAction) {
          if (sAction === MessageBox.Action.OK) {
            this._executeReanalyze();
          }
        }.bind(this)
      });
    },

    onGenerateDocument: function () {
      this._executeGenerateDocument();
    },

    onDownloadDocument: function () {
      var sAnalysisId = this._oViewModel.getProperty("/analysisId");
      this.getDocumentService().downloadDocument(sAnalysisId);
    },

    onIssuePress: function (oEvent) {
      this._showRowText(oEvent, "MessageText", "issueDetailsTitle");
    },

    onRetryComplexity: function () {
      this._oViewModel.setProperty("/loaded/complexity", false);
      this._showTab(Constants.section.complexity);
    },

    onRetryRecommendations: function () {
      this._oViewModel.setProperty("/loaded/recommendations", false);
      this._showTab(Constants.section.recommendations);
    },

    onRecommendationPress: function (oEvent) {
      var oContext = (oEvent.getParameter("listItem") || oEvent.getSource()).getBindingContext("detail");
      var oRecommendation = oContext && oContext.getObject();

      if (oRecommendation) {
        this._oViewModel.setProperty("/selectedRecommendation", oRecommendation);
        this._openRecommendationDetailDialog();
      }
    },

    onCloseRecommendationDetail: function () {
      this.byId("recommendationDetailDialog").close();
    },

    onDatabaseAccessPress: function (oEvent) {
      this._showRowText(oEvent, "RawStatement", "rawStatementTitle");
    },

    onCallPress: function (oEvent) {
      this._showRowText(oEvent, "RawStatement", "rawStatementTitle");
    },

    onRoutinePress: function (oEvent) {
      this._showRowText(oEvent, "RawHeader", "rawStatementTitle");
    },

    onScopePress: function (oEvent) {
      this._showRowText(oEvent, "ScopeCode", "scopeCodeTitle");
    },

    onHistoryPress: function (oEvent) {
      var oContext = (oEvent.getParameter("listItem") || oEvent.getSource()).getBindingContext("detail");
      var oAnalysis = oContext && oContext.getObject();

      if (oAnalysis && oAnalysis.AnalysisId) {
        this.getRouter().navTo("analysisDetail", {
          analysisId: oAnalysis.AnalysisId
        });
      }
    },

    _onRouteMatched: function (oEvent) {
      var oArguments = oEvent.getParameter("arguments");
      var sAnalysisId = decodeURIComponent(oArguments.analysisId || "");

      this._resetState(sAnalysisId);
      this._loadOverview().then(function () {
        this._showTab(Constants.section.overview);
      }.bind(this));
    },

    _resetState: function (sAnalysisId) {
      this._oViewModel.setData(models.createAnalysisDetailModel().getData());
      this._oViewModel.setProperty("/analysisId", sAnalysisId);
      this._clearTabContent();
    },

    _resetLoadedState: function () {
      Object.keys(this._oViewModel.getProperty("/loaded")).forEach(function (sKey) {
        this._oViewModel.setProperty("/loaded/" + sKey, false);
      }.bind(this));
    },

    _showTab: function (sTabKey) {
      return this._loadTabData(sTabKey).then(function () {
        return this._renderTabContent(sTabKey);
      }.bind(this));
    },

    _loadTabData: function (sTabKey) {
      if (this._oViewModel.getProperty("/loaded/" + sTabKey)) {
        return Promise.resolve();
      }

      if (sTabKey === Constants.section.overview) {
        return this._loadOverview();
      }

      if (sTabKey === Constants.section.complexity) {
        return this._loadComplexity();
      }

      if (sTabKey === Constants.section.recommendations) {
        return this._loadRecommendations();
      }

      if (sTabKey === Constants.section.issues) {
        return this._loadIssues();
      }

      if (sTabKey === Constants.section.database) {
        return this._loadDatabase();
      }

      if (sTabKey === Constants.section.businessLogic) {
        return this._loadBusinessLogic();
      }

      if (sTabKey === Constants.section.dependencyGraph) {
        return this._loadGraph();
      }

      if (sTabKey === Constants.section.document) {
        return this._loadDocument();
      }

      if (sTabKey === Constants.section.history) {
        return this._loadHistory();
      }

      return Promise.resolve();
    },

    _renderTabContent: function (sTabKey) {
      var oContainer = this.byId("tabContentContainer");

      this._clearTabContent();

      return this._getTabFragment(sTabKey).then(function (oContent) {
        oContainer.addItem(oContent);
      });
    },

    _clearTabContent: function () {
      var oContainer = this.byId("tabContentContainer");

      if (oContainer) {
        oContainer.removeAllItems();
      }
    },

    _getTabFragment: function (sTabKey) {
      var mFragmentNames = {};

      mFragmentNames[Constants.section.overview] = "OverviewTab";
      mFragmentNames[Constants.section.complexity] = "ComplexityTab";
      mFragmentNames[Constants.section.recommendations] = "RecommendationsTab";
      mFragmentNames[Constants.section.issues] = "IssuesTab";
      mFragmentNames[Constants.section.database] = "DatabaseTab";
      mFragmentNames[Constants.section.businessLogic] = "BusinessLogicTab";
      mFragmentNames[Constants.section.dependencyGraph] = "DependencyGraphTab";
      mFragmentNames[Constants.section.document] = "DocumentTab";
      mFragmentNames[Constants.section.history] = "HistoryTab";

      if (!this._mTabFragments[sTabKey]) {
        this._mTabFragments[sTabKey] = Fragment.load({
          id: this.getView().getId(),
          name: "abap.to.fiori.system.view.fragments.detail." + mFragmentNames[sTabKey],
          controller: this
        });
      }

      return this._mTabFragments[sTabKey];
    },

    _loadOverview: function () {
      var sAnalysisId = this._oViewModel.getProperty("/analysisId");

      this._setBusy(true);
      return this.getAnalysisService().getAnalysisById(sAnalysisId)
        .then(function (oAnalysis) {
          var oSummary = oAnalysis && oAnalysis._Summary || {};
          var oComplexity = oAnalysis && oAnalysis._Complexity || null;

          this._oViewModel.setProperty("/overview", oAnalysis || {});
          this._oViewModel.setProperty("/summary", oSummary);
          this._oViewModel.setProperty("/complexity", oComplexity);
          this._oViewModel.setProperty("/counts", this._buildCounts(oAnalysis, oSummary));
          this._oViewModel.setProperty("/loaded/overview", true);
          this._oViewModel.setProperty("/loaded/complexity", true);
        }.bind(this))
        .catch(function (oError) {
          this.showError(oError, "loadOverviewError");
        }.bind(this))
        .finally(function () {
          this._setBusy(false);
        }.bind(this));
    },

    _loadComplexity: function () {
      if (this._oViewModel.getProperty("/loaded/complexity")) {
        return Promise.resolve();
      }

      this._oViewModel.setProperty("/loading/complexity", true);
      this._oViewModel.setProperty("/errors/complexity", null);

      return this.getAnalysisService().getComplexity(this._oViewModel.getProperty("/analysisId"))
        .then(function (oComplexity) {
          this._oViewModel.setProperty("/complexity", oComplexity);
          this._oViewModel.setProperty("/loaded/complexity", true);
        }.bind(this))
        .catch(function (oError) {
          this._oViewModel.setProperty("/errors/complexity", oError && oError.message || this.getText("loadComplexityError"));
        }.bind(this))
        .finally(function () {
          this._oViewModel.setProperty("/loading/complexity", false);
        }.bind(this));
    },

    _loadRecommendations: function () {
      this._oViewModel.setProperty("/loading/recommendations", true);
      this._oViewModel.setProperty("/errors/recommendations", null);

      return this.getAnalysisService().getRecommendations(this._oViewModel.getProperty("/analysisId"))
        .then(function (aRows) {
          this._oViewModel.setProperty("/recommendations", aRows);
          this._oViewModel.setProperty("/counts/recommendations", aRows.length);
          this._oViewModel.setProperty("/loaded/recommendations", true);
        }.bind(this))
        .catch(function (oError) {
          this._oViewModel.setProperty("/errors/recommendations", oError && oError.message || this.getText("loadRecommendationsError"));
        }.bind(this))
        .finally(function () {
          this._oViewModel.setProperty("/loading/recommendations", false);
        }.bind(this));
    },

    _loadIssues: function () {
      this._setBusy(true);
      return this.getAnalysisService().getIssues(this._oViewModel.getProperty("/analysisId"))
        .then(function (aRows) {
          this._oViewModel.setProperty("/issues", aRows);
          this._oViewModel.setProperty("/counts/issues", aRows.length);
          this._oViewModel.setProperty("/loaded/issues", true);
        }.bind(this))
        .catch(function (oError) {
          this.showError(oError, "loadIssuesError");
        }.bind(this))
        .finally(function () {
          this._setBusy(false);
        }.bind(this));
    },

    _loadDatabase: function () {
      this._setBusy(true);
      return this.getAnalysisService().getDatabaseDetails(this._oViewModel.getProperty("/analysisId"))
        .then(function (oData) {
          this._oViewModel.setProperty("/databaseAccesses", oData.databaseAccesses);
          this._oViewModel.setProperty("/databaseReferences", oData.databaseReferences);
          this._oViewModel.setProperty("/counts/databaseAccesses", oData.databaseAccesses.length);
          this._oViewModel.setProperty("/counts/databaseReferences", oData.databaseReferences.length);
          this._oViewModel.setProperty("/loaded/database", true);
        }.bind(this))
        .catch(function (oError) {
          this.showError(oError, "loadDatabaseError");
        }.bind(this))
        .finally(function () {
          this._setBusy(false);
        }.bind(this));
    },

    _loadBusinessLogic: function () {
      this._setBusy(true);
      return this.getAnalysisService().getBusinessLogic(this._oViewModel.getProperty("/analysisId"))
        .then(function (oData) {
          this._oViewModel.setProperty("/calls", oData.calls);
          this._oViewModel.setProperty("/routines", oData.routines);
          this._oViewModel.setProperty("/scopes", oData.scopes);
          this._oViewModel.setProperty("/counts/calls", oData.calls.length);
          this._oViewModel.setProperty("/counts/routines", oData.routines.length);
          this._oViewModel.setProperty("/counts/scopes", oData.scopes.length);
          this._oViewModel.setProperty("/loaded/businessLogic", true);
        }.bind(this))
        .catch(function (oError) {
          this.showError(oError, "loadBusinessLogicError");
        }.bind(this))
        .finally(function () {
          this._setBusy(false);
        }.bind(this));
    },

    _loadGraph: function () {
      this._setBusy(true);
      return this.getAnalysisService().getGraph(this._oViewModel.getProperty("/analysisId"))
        .then(function (oData) {
          this._oViewModel.setProperty("/nodes", oData.nodes);
          this._oViewModel.setProperty("/edges", oData.edges);
          this._oViewModel.setProperty("/counts/nodes", oData.nodes.length);
          this._oViewModel.setProperty("/counts/edges", oData.edges.length);
          this._oViewModel.setProperty("/loaded/dependencyGraph", true);
        }.bind(this))
        .catch(function (oError) {
          this.showError(oError, "loadGraphError");
        }.bind(this))
        .finally(function () {
          this._setBusy(false);
        }.bind(this));
    },

    _loadDocument: function () {
      this._setBusy(true);
      return this.getDocumentService().getDocumentMetadata(this._oViewModel.getProperty("/analysisId"))
        .then(function (oDocument) {
          this._oViewModel.setProperty("/document", oDocument);
          this._oViewModel.setProperty("/loaded/document", true);
        }.bind(this))
        .catch(function (oError) {
          this.showError(oError, "loadDocumentError");
        }.bind(this))
        .finally(function () {
          this._setBusy(false);
        }.bind(this));
    },

    _loadHistory: function () {
      var sRootProgram = this._oViewModel.getProperty("/overview/RootProgram");

      this._setBusy(true);
      return this.getAnalysisService().getHistory(sRootProgram)
        .then(function (aRows) {
          this._oViewModel.setProperty("/history", aRows);
          this._oViewModel.setProperty("/counts/history", aRows.length);
          this._oViewModel.setProperty("/loaded/history", true);
        }.bind(this))
        .catch(function (oError) {
          this.showError(oError, "loadHistoryError");
        }.bind(this))
        .finally(function () {
          this._setBusy(false);
        }.bind(this));
    },

    _executeReanalyze: function () {
      this._setBusy(true);
      this.getAnalysisService().reanalyze(this._oViewModel.getProperty("/analysisId"))
        .then(function (oAnalysis) {
          MessageToast.show(this.getText("reanalyzeSuccess"));
          if (oAnalysis && oAnalysis.AnalysisId) {
            this.getRouter().navTo("analysisDetail", {
              analysisId: oAnalysis.AnalysisId
            });
          } else {
            this.onRefresh();
          }
        }.bind(this))
        .catch(function (oError) {
          this.showError(oError, "reanalyzeError");
        }.bind(this))
        .finally(function () {
          this._setBusy(false);
        }.bind(this));
    },

    _executeGenerateDocument: function () {
      var sAnalysisId = this._oViewModel.getProperty("/analysisId");

      this._setBusy(true);
      this.getDocumentService().generateDocument(sAnalysisId)
        .then(function () {
          MessageToast.show(this.getText("generateDocumentSuccess"));
          this._oViewModel.setProperty("/loaded/document", false);
          this._loadDocument();
        }.bind(this))
        .catch(function (oError) {
          this.showError(oError, "generateDocumentError");
        }.bind(this))
        .finally(function () {
          this._setBusy(false);
        }.bind(this));
    },

    _showRowText: function (oEvent, sProperty, sTitleKey) {
      var oContext = (oEvent.getParameter("listItem") || oEvent.getSource()).getBindingContext("detail");
      var oRow = oContext && oContext.getObject();
      var sText = oRow && oRow[sProperty] || this.getText("notAvailable");

      MessageBox.information(sText, {
        title: this.getText(sTitleKey)
      });
    },

    _openRecommendationDetailDialog: function () {
      if (!this._pRecommendationDetailDialog) {
        this._pRecommendationDetailDialog = Fragment.load({
          id: this.getView().getId(),
          name: "abap.to.fiori.system.view.fragments.detail.RecommendationDetail",
          controller: this
        }).then(function (oDialog) {
          this.getView().addDependent(oDialog);
          return oDialog;
        }.bind(this));
      }

      this._pRecommendationDetailDialog.then(function (oDialog) {
        oDialog.open();
      });
    },

    _buildCounts: function (oAnalysis, oSummary) {
      return {
        issues: oAnalysis && oAnalysis.IssueCount,
        warnings: oAnalysis && oAnalysis.WarningCount,
        databaseAccesses: oSummary && oSummary.DbAccessCount,
        databaseReferences: oSummary && oSummary.DbRefCount,
        calls: oSummary && oSummary.CallCount,
        routines: oSummary && oSummary.RoutineCount,
        nodes: oAnalysis && oAnalysis.NodeCount,
        edges: oAnalysis && oAnalysis.EdgeCount
      };
    },

    _setBusy: function (bBusy) {
      this._oViewModel.setProperty("/busy", bBusy);
    }
  });
});
