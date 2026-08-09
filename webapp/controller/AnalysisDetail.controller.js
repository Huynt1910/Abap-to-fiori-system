sap.ui.define([
  "sap/ui/core/Fragment",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/model/Sorter",
  "abap/to/fiori/system/controller/BaseController",
  "abap/to/fiori/system/model/models",
  "abap/to/fiori/system/model/mailConstants",
  "abap/to/fiori/system/model/mailFormatter",
  "abap/to/fiori/system/model/ComparisonConstants",
  "abap/to/fiori/system/model/AnalysisTableConfig",
  "abap/to/fiori/system/util/TablePersonalizationService",
  "abap/to/fiori/system/util/Constants",
  "abap/to/fiori/system/util/formatter"
], function (Fragment, MessageBox, MessageToast, Filter, FilterOperator, Sorter, BaseController, models, MailConstants, mailFormatter, ComparisonConstants, AnalysisTableConfig, TablePersonalizationService, Constants, formatter) {
  "use strict";

  return BaseController.extend("abap.to.fiori.system.controller.AnalysisDetail", {
    formatter: formatter,
    mailFormatter: mailFormatter,

    onInit: function () {
      this._oViewModel = models.createAnalysisDetailModel();
      this._oTablePersonalization = new TablePersonalizationService();
      this.getView().setModel(this._oViewModel, "detail");
      this._oMailViewModel = models.createMailUiModel();
      this.getView().setModel(this._oMailViewModel, "mailUi");
      this.getRouter().getRoute("analysisDetail").attachPatternMatched(this._onRouteMatched, this);
      this.getRouter().getRoute("detail").attachPatternMatched(this._onRouteMatched, this);
    },

    onBackToDashboard: function () {
      this.getRouter().navTo("dashboard");
    },

    onExit: function () {
      this.getComparisonService().cancelPolling();
      this.getDocumentService().cancelExportPolling();
      if (this._iProgramValueHelpSearchTimer) {
        clearTimeout(this._iProgramValueHelpSearchTimer);
      }
    },

    onSectionNavigate: function (oEvent) {
      var oSection = oEvent.getParameter("section");
      var sSectionId = oSection && oSection.getId && oSection.getId();
      var sSectionKey = this._getSectionKeyFromId(sSectionId);

      if (sSectionKey) {
        this._oViewModel.setProperty("/selectedTab", sSectionKey);
      }
    },

    onRefresh: function () {
      this._resetLoadedState();
      this._loadHeader().then(function () {
        return this._loadAllTabData();
      }.bind(this));
    },

    onOpenExportAllDialog: function () {
      this._resetExportState({
        exportSection: Constants.exportSection.all,
        selectedSection: Constants.exportSection.all,
        sections: this._buildAllExportSectionSelection()
      });
      this._openExportDialog();
    },

    onOpenExportDialog: function () {
      this.onOpenExportAllDialog();
    },

    onOpenSectionExportDialog: function (oEvent) {
      var sSection = oEvent.getSource().data("section");

      if (!this._isSectionExportAvailable(sSection)) {
        return;
      }

      this._resetExportState({
        section: sSection
      });
      this._openExportDialog();
    },

    onOpenDetailTableSettings: function (oEvent) {
      var sSection = oEvent.getSource().data("section");

      if (!sSection) {
        return;
      }

      this._sDetailTableSettingsSection = sSection;
      this._mDetailSettingsSnapshot = JSON.parse(JSON.stringify(this._oViewModel.getProperty("/tableSettingsState/" + sSection) || {}));
      this._mDetailColumnSnapshot = Object.assign({}, this._oViewModel.getProperty("/columns/" + sSection) || {});
      this._prepareDetailTableSettings(sSection);
      this._openDetailTableSettingsDialog();
    },

    onSearchDetailTableSettings: function (oEvent) {
      this._filterDetailTableSettingsList(oEvent.getParameter("newValue"));
    },

    onDetailTableSettingSelectionChange: function () {
      setTimeout(this._updateDetailTableSettingsCount.bind(this), 0);
    },

    onToggleDetailTableShowSelected: function () {
      this._oViewModel.setProperty("/tableSettings/showSelected", !this._oViewModel.getProperty("/tableSettings/showSelected"));
      this._filterDetailTableSettingsList(this._oViewModel.getProperty("/tableSettings/search"));
    },

    onSelectAllDetailTableColumns: function () {
      this._setAllDetailTableColumns(true);
    },

    onClearAllDetailTableColumns: function () {
      this._setAllDetailTableColumns(false);
    },

    onMoveDetailColumnToTop: function () {
      this._moveSelectedDetailColumn("top");
    },

    onMoveDetailColumnUp: function () {
      this._moveSelectedDetailColumn("up");
    },

    onMoveDetailColumnDown: function () {
      this._moveSelectedDetailColumn("down");
    },

    onMoveDetailColumnToBottom: function () {
      this._moveSelectedDetailColumn("bottom");
    },

    onDetailColumnDrop: function (oEvent) {
      var oDragged = oEvent.getParameter("draggedControl");
      var oDropped = oEvent.getParameter("droppedControl");
      var sDropPosition = oEvent.getParameter("dropPosition");
      var oDraggedContext = oDragged && oDragged.getBindingContext("detail");
      var oDroppedContext = oDropped && oDropped.getBindingContext("detail");
      var oDraggedColumn = oDraggedContext && oDraggedContext.getObject();
      var oDroppedColumn = oDroppedContext && oDroppedContext.getObject();
      var aItems = (this._oViewModel.getProperty("/tableSettings/items") || []).slice();
      var iDraggedIndex = aItems.indexOf(oDraggedColumn);
      var iDroppedIndex = aItems.indexOf(oDroppedColumn);

      if (iDraggedIndex < 0 || iDroppedIndex < 0 || iDraggedIndex === iDroppedIndex) {
        return;
      }

      aItems.splice(iDraggedIndex, 1);
      if (iDraggedIndex < iDroppedIndex) {
        iDroppedIndex -= 1;
      }
      if (sDropPosition === "After") {
        iDroppedIndex += 1;
      }
      aItems.splice(iDroppedIndex, 0, oDraggedColumn);
      this._oViewModel.setProperty("/tableSettings/items", this._reindexDetailColumns(aItems));
    },

    onAddDetailSorter: function () {
      this._addDetailCriterion("sorters", "sortFields");
    },

    onRemoveDetailSorter: function (oEvent) {
      this._removeDetailCriterion(oEvent, "sorters");
    },

    onAddDetailGroup: function () {
      this._addDetailCriterion("groups", "groupFields");
    },

    onRemoveDetailGroup: function (oEvent) {
      this._removeDetailCriterion(oEvent, "groups");
    },

    onAddDetailFilter: function () {
      this._addDetailCriterion("filters", "filterFields");
    },

    onRemoveDetailFilter: function (oEvent) {
      this._removeDetailCriterion(oEvent, "filters");
    },

    onResetDetailTableSettings: function () {
      var sSection = this._sDetailTableSettingsSection;
      var oConfig = AnalysisTableConfig.getConfig(sSection);
      var oState;

      if (!sSection) {
        return;
      }

      oState = this._oTablePersonalization.resetState(oConfig);
      this._setPersonalizationState(sSection, oState);
      this._prepareDetailTableSettings(sSection, oState);
    },

    onConfirmDetailTableSettings: function () {
      var sSection = this._sDetailTableSettingsSection;
      var oConfig = AnalysisTableConfig.getConfig(sSection);
      var oState = this._buildDetailSettingsStateFromDialog(sSection);

      if (!this._validateDetailSettingsState(oState)) {
        MessageBox.error(this.getText("personalizationAtLeastOneColumn"));
        return;
      }

      oState = this._oTablePersonalization.saveState(oConfig, oState);
      this._setPersonalizationState(sSection, oState);
      this._applyTablePersonalization(sSection);
      this._refreshExportAvailability();
      this._mDetailColumnSnapshot = null;
      this._mDetailSettingsSnapshot = null;
      this._sDetailTableSettingsSection = "";
      this.byId("detailTableSettingsDialog").close();
    },

    onCancelDetailTableSettings: function () {
      if (this._sDetailTableSettingsSection && this._mDetailColumnSnapshot) {
        this._oViewModel.setProperty("/columns/" + this._sDetailTableSettingsSection, this._mDetailColumnSnapshot);
      }
      if (this._sDetailTableSettingsSection && this._mDetailSettingsSnapshot) {
        this._oViewModel.setProperty("/tableSettingsState/" + this._sDetailTableSettingsSection, this._mDetailSettingsSnapshot);
      }
      this._mDetailColumnSnapshot = null;
      this._mDetailSettingsSnapshot = null;
      this._sDetailTableSettingsSection = "";
      this.byId("detailTableSettingsDialog").close();
    },

    onCreateMailJobForAnalysis: function () {
      var sAnalysisId = this._oViewModel.getProperty("/analysisId");
      if (sAnalysisId) {
        this._resetMailWizard();
        this._prefillMailWizardFromAnalysis();
        this._openMailWizard();
      }
    },

    onRunComparisonForAnalysis: function () {
      var sAnalysisId = this._oViewModel.getProperty("/analysisId");
      var oComparisonService = this.getComparisonService();

      if (this._oViewModel.getProperty("/comparison/busy")) {
        return;
      }

      if (!oComparisonService.isGuid(sAnalysisId)) {
        MessageBox.error(this.getText("comparisonAnalysisIdRequired"));
        return;
      }

      this._setComparisonProgress(true, ComparisonConstants.progressState.submitting, this.getText("comparisonSubmitting"));

      var iStartedAt = Date.now();
      var aPreviousRunIds = [];

      oComparisonService.cancelPolling();
      oComparisonService.resetCancellation();

      oComparisonService.getComparisonRuns({
        top: 100,
        filters: { analysisId: sAnalysisId }
      }).then(function (aRuns) {
        aPreviousRunIds = (aRuns || []).map(function (oRun) {
          return oRun.CmpRunId;
        }).filter(Boolean);
        return oComparisonService.executeComparison(sAnalysisId);
      }).then(function () {
        this._setComparisonProgress(true, ComparisonConstants.progressState.discoveringRun, this.getText("comparisonDiscoveringRun"));
        return oComparisonService.discoverNewRun(sAnalysisId, aPreviousRunIds, iStartedAt);
      }.bind(this)).then(function (oRun) {
        this._setComparisonProgress(true, ComparisonConstants.progressState.running, this.getText("comparisonRunning"));
        return oComparisonService.pollRunStatus(oRun.CmpRunId);
      }.bind(this)).then(function (oRun) {
        var sRunId = oRun && oRun.CmpRunId;
        var bFailed = oComparisonService.isFailedStatus(oRun && oRun.RunStatus);
        var sMessage = bFailed ?
          (oRun.ErrorMessage || this.getText("comparisonFailed")) :
          this.getText("comparisonCompleted");

        this._setComparisonProgress(false, bFailed ? ComparisonConstants.progressState.failed : ComparisonConstants.progressState.completed, sMessage);

        if (bFailed) {
          MessageBox.error(sMessage);
        } else {
          MessageToast.show(sMessage);
        }

        if (sRunId) {
          this.getRouter().navTo(ComparisonConstants.route.detail, {
            cmpRunId: encodeURIComponent(sRunId)
          });
        }
      }.bind(this)).catch(function (oError) {
        this._setComparisonProgress(false, ComparisonConstants.progressState.failed, oError && oError.message || this.getText("comparisonRunError"));
        MessageBox.error(oError && oError.message || this.getText("comparisonRunError"));
      }.bind(this));
    },

    onCancelMailJobWizard: function () {
      this._oMailViewModel.setProperty("/wizard/busy", false);
      this._oMailViewModel.setProperty("/wizard/errorMessage", "");
      this.byId("mailJobWizardDialog").close();
    },

    onAddDraftRecipient: function () {
      var oRecipient = Object.assign({}, this._oMailViewModel.getProperty("/wizard/newRecipient"));
      var aRecipients = this._oMailViewModel.getProperty("/wizard/recipients").slice();

      this._oMailViewModel.setProperty("/wizard/errorMessage", "");
      oRecipient.SapUser = String(oRecipient.SapUser || "").trim();
      oRecipient.RecipientType = oRecipient.RecipientType || MailConstants.recipientType.to;

      if (!oRecipient.SapUser) {
        MessageToast.show(this.getText("validationSapUserRequired"));
        return;
      }

      aRecipients.push(oRecipient);
      this._oMailViewModel.setProperty("/wizard/recipients", aRecipients);
      if (aRecipients.length === 1) {
        this._oMailViewModel.setProperty("/wizard/activateAfterCreate", true);
      }
      this._oMailViewModel.setProperty("/wizard/newRecipient", {
        RecipientType: MailConstants.recipientType.to,
        SapUser: ""
      });
    },

    onRemoveDraftRecipient: function (oEvent) {
      var oContext = oEvent.getSource().getBindingContext("mailUi");
      var sPath = oContext && oContext.getPath();
      var iIndex = sPath ? Number(sPath.split("/").pop()) : -1;
      var aRecipients = this._oMailViewModel.getProperty("/wizard/recipients").slice();

      if (iIndex >= 0) {
        aRecipients.splice(iIndex, 1);
        this._oMailViewModel.setProperty("/wizard/recipients", aRecipients);
        if (!aRecipients.length) {
          this._oMailViewModel.setProperty("/wizard/activateAfterCreate", false);
        }
      }
    },

    onSaveMailJob: function () {
      var oWizard = this._oMailViewModel.getProperty("/wizard");
      var oJob = this._normalizeMailJob(oWizard.job);
      var aRecipients = oWizard.recipients || [];
      var aErrors = this._validateMailJob(oJob);

      this._oMailViewModel.setProperty("/wizard/errorMessage", "");

      if (aErrors.length) {
        this._oMailViewModel.setProperty("/wizard/errorMessage", aErrors.join("\n"));
        MessageBox.error(aErrors.join("\n"));
        return;
      }

      this._oMailViewModel.setProperty("/wizard/busy", true);
      this._withMailRequestTimeout(this.getMailService().createMailJobWithRecipients({
        job: oJob,
        recipients: aRecipients,
        activateAfterCreate: oWizard.activateAfterCreate
      })).then(function (oCreated) {
        var sJobId = oCreated && oCreated.object && oCreated.object.JobId;
        if (this.getOwnerComponent().setPendingCreatedMailJobId) {
          this.getOwnerComponent().setPendingCreatedMailJobId(sJobId);
        }
        MessageToast.show(this.getText("mailJobCreated"));
        this.byId("mailJobWizardDialog").close();
        this.getRouter().navTo("mailJobs");
      }.bind(this)).catch(this._showMailWizardError.bind(this)).finally(function () {
        this._oMailViewModel.setProperty("/wizard/busy", false);
      }.bind(this));
    },

    onCloseWizardError: function () {
      this._oMailViewModel.setProperty("/wizard/errorMessage", "");
    },

    onCancelExport: function () {
      if (this._oViewModel.getProperty("/export/busy")) {
        return;
      }

      this.byId("exportReportDialog").close();
      this.getDocumentService().cancelExportPolling();
      this._oViewModel.setProperty("/export/dialogOpen", false);
    },

    onDownloadExport: function () {
      var oExport = this._oViewModel.getProperty("/export");
      var sSelectedFields = this._getSelectedExportFieldExpression();
      var sFileName = this._getExportFileName(oExport);

      if (oExport.busy) {
        return;
      }

      if (!this._canPrepareSelectedExport()) {
        MessageBox.error(this.getText("exportNotAvailable"));
        return;
      }

      this._oViewModel.setProperty("/export/busy", true);
      this.getDocumentService().downloadSelectedExport(this._oViewModel.getProperty("/analysisId"), {
        fileFormat: oExport.fileFormat,
        exportSection: oExport.exportSection,
        selectedFields: sSelectedFields,
        fileName: sFileName
      }).then(function () {
        MessageToast.show(this.getText("exportSuccess"));
        this.byId("exportReportDialog").close();
        this._oViewModel.setProperty("/export/dialogOpen", false);
      }.bind(this)).catch(function (oError) {
        MessageBox.error(oError && oError.message || this.getText("exportError"));
      }.bind(this)).finally(function () {
        this._oViewModel.setProperty("/export/busy", false);
      }.bind(this));
    },

    onMessagePress: function (oEvent) {
      this._showRowText(oEvent, "MessageText", "messageDetailsTitle");
    },

    onDatabaseObjectPress: function (oEvent) {
      this._showRowText(oEvent, "Description", "databaseObjectDetailsTitle");
    },

    onBusinessLogicPress: function (oEvent) {
      this._showRowText(oEvent, "Description", "businessLogicDetailsTitle");
    },

    onAlvOutputPress: function (oEvent) {
      var oContext = (oEvent.getParameter("listItem") || oEvent.getSource()).getBindingContext("detail");
      var oRow = oContext && oContext.getObject();

      if (oRow && oRow.AnalysisId && oRow.OutputId) {
        this.getRouter().navTo("alvOutputDetail", {
          analysisId: encodeURIComponent(oRow.AnalysisId),
          outputId: encodeURIComponent(oRow.OutputId)
        });
      }
    },

    onEvidencePress: function (oEvent) {
      this._showRowText(oEvent, "StatementText", "evidenceDetailsTitle");
    },

    onRetryRecommendations: function () {
      this._oViewModel.setProperty("/loaded/recommendations", false);
      this._loadTabData(Constants.section.recommendations);
    },

    onRecommendationPress: function (oEvent) {
      var oContext = (oEvent.getParameter("listItem") || oEvent.getSource()).getBindingContext("detail");
      var oRecommendation = oContext && oContext.getObject();

      if (oRecommendation) {
        this.getRouter().navTo("recommendationDetail", {
          analysisId: encodeURIComponent(oRecommendation.AnalysisId),
          recommendationId: encodeURIComponent(oRecommendation.RecommendationId)
        });
      }
    },

    onCloseAlvOutputInlineDetail: function () {
      this._oViewModel.setProperty("/selectedAlvOutput", null);
      this._oViewModel.setProperty("/alvOutputDetail", {
        loading: false,
        error: null,
        columns: [],
        sorts: [],
        filters: [],
        events: []
      });
    },

    onCloseRecommendationDetail: function () {
      var oDialog = this.byId("recommendationDetailDialog");

      if (oDialog) {
        oDialog.close();
        return;
      }

      this.onCloseRecommendationInlineDetail();
    },

    onCloseRecommendationInlineDetail: function () {
      this._oViewModel.setProperty("/selectedRecommendation", null);
      this._oViewModel.setProperty("/recommendationDetail", {
        loading: false,
        error: null,
        annotations: []
      });
    },

    _onRouteMatched: function (oEvent) {
      var oArguments = oEvent.getParameter("arguments");
      var sAnalysisId = decodeURIComponent(oArguments.analysisId || "");

      this._resetState(sAnalysisId);
      this._loadHeader().then(function () {
        return this._loadAllTabData();
      }.bind(this));
    },

    _resetState: function (sAnalysisId) {
      this._oViewModel.setData(models.createAnalysisDetailModel().getData());
      this._oViewModel.setProperty("/analysisId", sAnalysisId);
      this._loadPersistedPersonalizationStates();
      this._refreshExportAvailability();
    },

    _resetLoadedState: function () {
      Object.keys(this._oViewModel.getProperty("/loaded")).forEach(function (sKey) {
        this._oViewModel.setProperty("/loaded/" + sKey, false);
      }.bind(this));
    },

    _loadHeader: function () {
      var sAnalysisId = this._oViewModel.getProperty("/analysisId");

      this._setBusy(true);
      return this.getAnalysisService().getAnalysisById(sAnalysisId)
        .then(function (oAnalysis) {
          this._oViewModel.setProperty("/overview", oAnalysis || {});
          this._oViewModel.setProperty("/counts", {
            uiFilters: oAnalysis && oAnalysis.TotalUiFilters,
            databaseObjects: oAnalysis && oAnalysis.TotalDatabaseObjects,
            businessLogic: oAnalysis && oAnalysis.TotalBusinessLogic,
            alvOutputs: oAnalysis && oAnalysis.TotalAlvOutputs,
            alvColumns: oAnalysis && oAnalysis.TotalAlvColumns,
            recommendations: oAnalysis && oAnalysis.TotalRecommendations
          });
        }.bind(this))
        .catch(function (oError) {
          this.showError(oError, "loadOverviewError");
        }.bind(this))
        .finally(function () {
          this._setBusy(false);
        }.bind(this));
    },

    _loadTabData: function (sTabKey) {
      if (this._oViewModel.getProperty("/loaded/" + sTabKey)) {
        return Promise.resolve();
      }

      if (sTabKey === Constants.section.sourceObjects) {
        return this._loadList("sourceObjects", "getSourceObjects", "loadSourceObjectsError");
      }

      if (sTabKey === Constants.section.uiFilters) {
        return this._loadList("uiFilters", "getUiFilters", "loadUiFiltersError");
      }

      if (sTabKey === Constants.section.databaseObjects) {
        return this._loadList("databaseObjects", "getDatabaseObjects", "loadDatabaseError");
      }

      if (sTabKey === Constants.section.businessLogic) {
        return this._loadList("businessLogic", "getBusinessLogic", "loadBusinessLogicError");
      }

      if (sTabKey === Constants.section.alvOutputs) {
        return this._loadList("alvOutputs", "getAlvOutputs", "loadAlvOutputsError");
      }

      if (sTabKey === Constants.section.evidences) {
        return this._loadList("evidences", "getEvidences", "loadEvidencesError");
      }

      if (sTabKey === Constants.section.recommendations) {
        return this._loadList("recommendations", "getRecommendations", "loadRecommendationsError");
      }

      if (sTabKey === Constants.section.messages) {
        return this._loadList("messages", "getMessages", "loadMessagesError");
      }

      return Promise.resolve();
    },

    _loadAllTabData: function () {
      return Promise.all(Object.keys(this._oViewModel.getProperty("/loaded") || {}).map(function (sTabKey) {
        return this._loadTabData(sTabKey);
      }.bind(this)));
    },

    _loadList: function (sStateKey, sServiceMethod, sErrorTextKey) {
      var sAnalysisId = this._oViewModel.getProperty("/analysisId");

      this._oViewModel.setProperty("/loading/" + sStateKey, true);
      this._oViewModel.setProperty("/errors/" + sStateKey, null);

      return this.getAnalysisService()[sServiceMethod](sAnalysisId)
        .then(function (aRows) {
          this._oViewModel.setProperty("/" + sStateKey, aRows);
          this._oViewModel.setProperty("/counts/" + sStateKey, aRows.length);
          this._oViewModel.setProperty("/loaded/" + sStateKey, true);
          this._applyTablePersonalization(sStateKey);
        }.bind(this))
        .catch(function (oError) {
          this._oViewModel.setProperty(
            "/errors/" + sStateKey,
            oError && oError.message || this.getText(sErrorTextKey)
          );
        }.bind(this))
        .finally(function () {
          this._oViewModel.setProperty("/loading/" + sStateKey, false);
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

    _selectAlvOutput: function (oRow) {
      var sAnalysisId = oRow && oRow.AnalysisId;
      var sOutputId = oRow && oRow.OutputId;

      this._oViewModel.setProperty("/selectedAlvOutput", oRow);
      this._oViewModel.setProperty("/alvOutputDetail", {
        loading: true,
        error: null,
        columns: [],
        sorts: [],
        filters: [],
        events: []
      });

      Promise.all([
        this.getAnalysisService().getAlvOutputChildren(sAnalysisId, sOutputId, "alvColumns"),
        this.getAnalysisService().getAlvOutputChildren(sAnalysisId, sOutputId, "alvSorts"),
        this.getAnalysisService().getAlvOutputChildren(sAnalysisId, sOutputId, "alvFilters"),
        this.getAnalysisService().getAlvOutputChildren(sAnalysisId, sOutputId, "alvEvents")
      ]).then(function (aResults) {
        this._oViewModel.setProperty("/alvOutputDetail/columns", aResults[0] || []);
        this._oViewModel.setProperty("/alvOutputDetail/sorts", aResults[1] || []);
        this._oViewModel.setProperty("/alvOutputDetail/filters", aResults[2] || []);
        this._oViewModel.setProperty("/alvOutputDetail/events", aResults[3] || []);
      }.bind(this)).catch(function (oError) {
        this._oViewModel.setProperty("/alvOutputDetail/error", oError && oError.message || this.getText("loadAlvOutputsError"));
      }.bind(this)).finally(function () {
        this._oViewModel.setProperty("/alvOutputDetail/loading", false);
      }.bind(this));
    },

    _selectRecommendation: function (oRecommendation) {
      var sAnalysisId = oRecommendation && oRecommendation.AnalysisId;
      var sRecommendationId = oRecommendation && oRecommendation.RecommendationId;

      this._oViewModel.setProperty("/selectedRecommendation", oRecommendation);
      this._oViewModel.setProperty("/recommendationDetail", {
        loading: true,
        error: null,
        annotations: []
      });

      this.getAnalysisService().getRecommendationAnnotations(sAnalysisId, sRecommendationId)
        .then(function (aRows) {
          this._oViewModel.setProperty("/recommendationDetail/annotations", aRows || []);
        }.bind(this))
        .catch(function (oError) {
          this._oViewModel.setProperty("/recommendationDetail/error", oError && oError.message || this.getText("loadRecommendationsError"));
        }.bind(this))
        .finally(function () {
          this._oViewModel.setProperty("/recommendationDetail/loading", false);
        }.bind(this));
    },

    _resetExportState: function (mOptions) {
      var sSelectedSection = mOptions && mOptions.section || this._oViewModel.getProperty("/selectedTab") || Constants.section.sourceObjects;
      var oConfig = AnalysisTableConfig.getConfig(sSelectedSection);
      var aSections = mOptions && mOptions.sections || this._buildSectionExportSelection(sSelectedSection);
      var aFields = this._flattenExportSections(aSections);
      var sFileFormat = Constants.fileFormat.excel;
      var sExportSection = mOptions && mOptions.exportSection || oConfig && oConfig.exportSection || "";
      var sReportType = this._oViewModel.getProperty("/overview/ProgramName") || "";
      var sDefaultFileName = this.getDocumentService().getFallbackFileName({
        reportType: sReportType,
        fileFormat: sFileFormat,
        exportSection: sExportSection || Constants.exportSection.all
      });

      this._oViewModel.setProperty("/export", {
        busy: false,
        fileFormat: sFileFormat,
        exportSection: sExportSection,
        reportType: sReportType,
        dialogOpen: false,
        isAll: (mOptions && mOptions.exportSection) === Constants.exportSection.all,
        selectedSection: mOptions && mOptions.selectedSection || sSelectedSection,
        selectedSectionLabel: (mOptions && mOptions.selectedSection) === Constants.exportSection.all ? "" : this._getExportSectionLabel(sSelectedSection),
        selectedFields: aFields.filter(function (oField) {
          return oField.selected;
        }).map(function (oField) {
          return oField.key;
        }),
        availableSections: aSections,
        availableFields: aFields,
        fileName: sDefaultFileName,
        defaultFileName: sDefaultFileName,
        message: ""
      });
    },

    onExportFileFormatChange: function () {
      var oExport = this._oViewModel.getProperty("/export") || {};
      var sPreviousDefault = oExport.defaultFileName || "";
      var sCurrentFileName = oExport.fileName || "";
      var sDefaultFileName = this.getDocumentService().getFallbackFileName({
        reportType: oExport.reportType,
        fileFormat: oExport.fileFormat,
        exportSection: oExport.exportSection || Constants.exportSection.all
      });

      this._oViewModel.setProperty("/export/defaultFileName", sDefaultFileName);
      if (!String(sCurrentFileName).trim() || sCurrentFileName === sPreviousDefault) {
        this._oViewModel.setProperty("/export/fileName", sDefaultFileName);
      }
    },

    _getExportFileName: function (oExport) {
      var sFileName = String(oExport && oExport.fileName || "").trim();

      return sFileName || oExport && oExport.defaultFileName || this.getDocumentService().getFallbackFileName({
        reportType: oExport && oExport.reportType,
        fileFormat: oExport && oExport.fileFormat,
        exportSection: oExport && oExport.exportSection || Constants.exportSection.all
      });
    },

    onExportFieldSelectionChange: function () {
      setTimeout(function () {
        this._syncExportSelection();
      }.bind(this), 0);
    },

    onToggleExportSection: function (oEvent) {
      var oContext = oEvent.getSource().getBindingContext("detail");
      var sPath = oContext && oContext.getPath();
      var bSelected = oEvent.getParameter("selected");
      var aFields;

      if (!sPath) {
        return;
      }

      aFields = this._oViewModel.getProperty(sPath + "/fields") || [];
      aFields.forEach(function (oField, iIndex) {
        this._oViewModel.setProperty(sPath + "/fields/" + iIndex + "/selected", bSelected);
      }.bind(this));
      this._syncExportSelection();
    },

    onToggleExportField: function (oEvent) {
      var oContext = oEvent.getSource().getBindingContext("detail");
      var sPath = oContext && oContext.getPath();
      var sSectionPath = sPath && sPath.replace(/\/fields\/\d+$/, "");
      var aFields;
      var bAnySelected;

      if (!sSectionPath) {
        return;
      }

      aFields = this._oViewModel.getProperty(sSectionPath + "/fields") || [];
      bAnySelected = aFields.some(function (oField) {
        return oField.selected === true;
      });
      this._oViewModel.setProperty(sSectionPath + "/selected", bAnySelected);
      this._syncExportSelection();
    },

    onSelectAllExportFields: function () {
      this._setAllExportFieldsSelected(true);
    },

    onClearExportFields: function () {
      this._setAllExportFieldsSelected(false);
    },

    _openExportDialog: function () {
      if (!this._pExportDialog) {
        this._pExportDialog = Fragment.load({
          id: this.getView().getId(),
          name: "abap.to.fiori.system.view.fragments.ExportReportDialog",
          controller: this
        }).then(function (oDialog) {
          this.getView().addDependent(oDialog);
          return oDialog;
        }.bind(this));
      }

      this._pExportDialog.then(function (oDialog) {
        this._oViewModel.setProperty("/export/dialogOpen", true);
        oDialog.open();
      }.bind(this));
    },

    _buildExportFieldSelection: function (sSection) {
      var oConfig = AnalysisTableConfig.getConfig(sSection);
      var oState = this._getPersonalizationState(sSection);
      var aFields = oConfig ? this._oTablePersonalization.getVisibleExportableFields(oConfig, oState) : [];

      return aFields.map(function (oField) {
        return {
          key: oField.key,
          label: this.getText(oField.labelKey),
          selected: true,
          priority: oField.priority
        };
      }.bind(this));
    },

    _buildAllExportFieldSelection: function () {
      var mSeen = {};
      var aFields = [];

      Object.keys(AnalysisTableConfig.configs).forEach(function (sSection) {
        if (!this._isSectionExportAvailable(sSection)) {
          return;
        }

        this._buildExportFieldSelection(sSection).forEach(function (oField) {
          var sKey = oField.key;
          if (!mSeen[sKey]) {
            mSeen[sKey] = true;
            aFields.push(Object.assign({}, oField, {
              label: this._getExportSectionLabel(sSection) + " - " + oField.label
            }));
          }
        }.bind(this));
      }.bind(this));

      return aFields;
    },

    _buildSectionExportSelection: function (sSection) {
      var oConfig = AnalysisTableConfig.getConfig(sSection);
      var aFields = this._buildExportFieldSelection(sSection);

      if (!oConfig || !oConfig.exportSection || !aFields.length) {
        return [];
      }

      return [{
        key: sSection,
        label: this._getExportSectionLabel(sSection),
        exportSection: oConfig.exportSection,
        selected: true,
        fields: aFields
      }];
    },

    _buildAllExportSectionSelection: function () {
      return Object.keys(AnalysisTableConfig.configs).map(function (sSection) {
        return this._buildSectionExportSelection(sSection)[0];
      }.bind(this)).filter(Boolean);
    },

    _getSelectedExportFieldKeys: function () {
      return (this._flattenExportSections(this._oViewModel.getProperty("/export/availableSections")) || []).filter(function (oField) {
        return oField.selected === true;
      }).map(function (oField) {
        return oField.key;
      }).filter(function (sKey, iIndex, aKeys) {
        return aKeys.indexOf(sKey) === iIndex;
      });
    },

    _getSelectedExportFieldExpression: function () {
      var oExport = this._oViewModel.getProperty("/export") || {};
      var aSections = this._oViewModel.getProperty("/export/availableSections") || [];

      if (oExport.exportSection === Constants.exportSection.all) {
        return aSections.filter(function (oSection) {
          return oSection && oSection.selected !== false;
        }).map(function (oSection) {
          var aFields = (oSection.fields || []).filter(function (oField) {
            return oField.selected === true;
          }).map(function (oField) {
            return oField.key;
          });

          return aFields.length ? oSection.exportSection + ":" + aFields.join(",") : "";
        }).filter(Boolean).join(";");
      }

      return this._getSelectedExportFieldKeys().join(",");
    },

    _setAllExportFieldsSelected: function (bSelected) {
      var aSections = (this._oViewModel.getProperty("/export/availableSections") || []).map(function (oSection) {
        return Object.assign({}, oSection, {
          selected: bSelected,
          fields: (oSection.fields || []).map(function (oField) {
            return Object.assign({}, oField, {
              selected: bSelected
            });
          })
        });
      });

      this._oViewModel.setProperty("/export/availableSections", aSections);
      this._syncExportSelection();
    },

    _syncExportSelection: function () {
      var aSections = this._oViewModel.getProperty("/export/availableSections") || [];
      var aFields = this._flattenExportSections(aSections);

      this._oViewModel.setProperty("/export/availableFields", aFields);
      this._oViewModel.setProperty("/export/selectedFields", this._getSelectedExportFieldKeys());
    },

    _flattenExportSections: function (aSections) {
      return (aSections || []).reduce(function (aResult, oSection) {
        if (!oSection || oSection.selected === false) {
          return aResult;
        }
        return aResult.concat((oSection.fields || []).map(function (oField) {
          return Object.assign({}, oField, {
            section: oSection.key,
            sectionLabel: oSection.label,
            selected: oSection.selected !== false && oField.selected === true
          });
        }));
      }, []);
    },

    _canPrepareSelectedExport: function () {
      var oControl = this._oViewModel.getProperty("/overview/__OperationControl");
      return oControl && oControl.PrepareSelectedExport === true;
    },

    _refreshExportAvailability: function () {
      var mAvailability = {};
      var bAnyAvailable = false;

      Object.keys(AnalysisTableConfig.configs).forEach(function (sSection) {
        mAvailability[sSection] = this._isSectionExportAvailable(sSection);
        bAnyAvailable = bAnyAvailable || mAvailability[sSection];
      }.bind(this));
      mAvailability.all = bAnyAvailable;

      this._oViewModel.setProperty("/exportAvailable", mAvailability);
    },

    _isSectionExportAvailable: function (sSection) {
      var oConfig = AnalysisTableConfig.getConfig(sSection);

      return !!(oConfig && oConfig.exportSection && this._buildExportFieldSelection(sSection).length);
    },

    _getExportSectionLabel: function (sSection) {
      var oConfig = AnalysisTableConfig.getConfig(sSection);

      return oConfig ? this.getText(oConfig.titleKey) : String(sSection || "");
    },

    _getDetailColumnSettings: function (sSection) {
      var oConfig = AnalysisTableConfig.getConfig(sSection);

      if (oConfig) {
        return {
          title: this.getText(oConfig.titleKey),
          columns: AnalysisTableConfig.getPersonalizableFields(sSection).map(function (oField) {
            return {
              key: oField.stateKey,
              fieldKey: oField.key,
              label: this.getText(oField.labelKey),
              priority: oField.priority,
              defaultVisible: oField.defaultVisible === true,
              exportable: oField.exportable !== false
            };
          }.bind(this))
        };
      }

      var mSettings = {
        uiFilters: {
          title: this.getText("uiFilters"),
          columns: [
            { key: "fieldName", label: this.getText("fieldName"), defaultVisible: true },
            { key: "fieldKind", label: this.getText("fieldKind"), defaultVisible: true },
            { key: "dataElement", label: this.getText("dataElement"), defaultVisible: true },
            { key: "selectionBlock", label: this.getText("selectionBlock"), defaultVisible: true },
            { key: "mandatory", label: this.getText("mandatory"), defaultVisible: true },
            { key: "multipleSelection", label: this.getText("multipleSelection"), defaultVisible: true },
            { key: "confidence", label: this.getText("confidence"), defaultVisible: true }
          ]
        },
        databaseObjects: {
          title: this.getText("databaseObjects"),
          columns: [
            { key: "objectName", label: this.getText("objectName"), defaultVisible: true },
            { key: "objectType", label: this.getText("objectType"), defaultVisible: true },
            { key: "operation", label: this.getText("operation"), defaultVisible: true },
            { key: "containingRoutine", label: this.getText("containingRoutine"), defaultVisible: true },
            { key: "pagingCapability", label: this.getText("pagingCapability"), defaultVisible: true },
            { key: "confidence", label: this.getText("confidence"), defaultVisible: true }
          ]
        },
        businessLogic: {
          title: this.getText("businessLogic"),
          columns: [
            { key: "objectName", label: this.getText("objectName"), defaultVisible: true },
            { key: "objectType", label: this.getText("objectType"), defaultVisible: true },
            { key: "containerName", label: this.getText("containerName"), defaultVisible: true },
            { key: "callingRoutine", label: this.getText("callingRoutine"), defaultVisible: true },
            { key: "reuseFeasibility", label: this.getText("reuseFeasibility"), defaultVisible: true },
            { key: "confidence", label: this.getText("confidence"), defaultVisible: true }
          ]
        },
        alvOutputs: {
          title: this.getText("alvOutputs"),
          columns: [
            { key: "outputName", label: this.getText("outputName"), defaultVisible: true },
            { key: "outputKind", label: this.getText("outputKind"), defaultVisible: true },
            { key: "framework", label: this.getText("framework"), defaultVisible: true },
            { key: "controlObject", label: this.getText("controlObject"), defaultVisible: true },
            { key: "outputTable", label: this.getText("outputTable"), defaultVisible: true },
            { key: "editable", label: this.getText("editable"), defaultVisible: true },
            { key: "confidence", label: this.getText("confidence"), defaultVisible: true }
          ]
        },
        evidences: {
          title: this.getText("evidence"),
          columns: [
            { key: "sourceObject", label: this.getText("sourceObject"), defaultVisible: true },
            { key: "startLine", label: this.getText("startLine"), defaultVisible: true },
            { key: "endLine", label: this.getText("endLine"), defaultVisible: true },
            { key: "statementId", label: this.getText("statementId"), defaultVisible: true },
            { key: "statementText", label: this.getText("statementText"), defaultVisible: true }
          ]
        },
        recommendations: {
          title: this.getText("recommendationsTabTitle"),
          columns: [
            { key: "severity", label: this.getText("severity"), defaultVisible: true },
            { key: "targetLayer", label: this.getText("targetLayer"), defaultVisible: true },
            { key: "title", label: this.getText("title"), defaultVisible: true },
            { key: "ruleId", label: this.getText("ruleId"), defaultVisible: true },
            { key: "confidence", label: this.getText("confidence"), defaultVisible: true }
          ]
        },
        messages: {
          title: this.getText("messages"),
          columns: [
            { key: "messageNo", label: this.getText("messageNo"), defaultVisible: true },
            { key: "messageType", label: this.getText("messageType"), defaultVisible: true },
            { key: "messageCode", label: this.getText("messageCode"), defaultVisible: true },
            { key: "sourceObject", label: this.getText("sourceObject"), defaultVisible: true },
            { key: "sourceLine", label: this.getText("sourceLine"), defaultVisible: true },
            { key: "messageText", label: this.getText("messageText"), defaultVisible: true }
          ]
        }
      };

      return mSettings[sSection] || { title: this.getText("viewSettings"), columns: [] };
    },

    _prepareDetailTableSettings: function (sSection) {
      var oSettings = this._getDetailColumnSettings(sSection);
      var oState = arguments.length > 1 ? arguments[1] : this._getPersonalizationState(sSection);
      var mColumnState = {};
      var aItems;

      (oState.columns || []).forEach(function (oColumn) {
        mColumnState[oColumn.key] = oColumn;
      });

      aItems = oSettings.columns.map(function (oColumn) {
        var oColumnState = mColumnState[oColumn.fieldKey] || {};
        return Object.assign({}, oColumn, {
          visible: oColumnState.visible === true,
          index: typeof oColumnState.index === "number" ? oColumnState.index : 999
        });
      }).sort(function (a, b) {
        return a.index - b.index;
      });

      this._oViewModel.setProperty("/tableSettings", {
        section: sSection,
        title: oSettings.title,
        items: aItems,
        sorters: (oState.sorters || []).slice(),
        groups: (oState.groups || []).slice(),
        filters: (oState.filters || []).slice(),
        sortFields: this._buildCapabilityItems(sSection, "sortable"),
        groupFields: this._buildCapabilityItems(sSection, "groupable"),
        filterFields: this._buildCapabilityItems(sSection, "filterable"),
        search: "",
        showSelected: false,
        selectedCount: aItems.filter(function (oColumn) {
          return oColumn.visible;
        }).length,
        totalCount: aItems.length
      });
    },

    _updateDetailTableSettingsCount: function () {
      var sSection = this._sDetailTableSettingsSection;
      var aItems = this._oViewModel.getProperty("/tableSettings/items") || [];

      if (!sSection) {
        return;
      }

      aItems.forEach(function (oColumn) {
        this._oViewModel.setProperty("/columns/" + sSection + "/" + oColumn.key, oColumn.visible !== false);
      }.bind(this));
      this._oViewModel.setProperty("/tableSettings/selectedCount", aItems.filter(function (oColumn) {
        return oColumn.visible;
      }).length);
    },

    _filterDetailTableSettingsList: function (sSearch) {
      var oList = this.byId("detailTableSettingsList");
      var oBinding = oList && oList.getBinding("items");
      var sValue = String(sSearch || "").trim();
      var aFilters = [];

      this._oViewModel.setProperty("/tableSettings/search", sValue);

      if (oBinding) {
        if (sValue) {
          aFilters.push(new Filter({
            filters: [
              new Filter("label", FilterOperator.Contains, sValue),
              new Filter("fieldKey", FilterOperator.Contains, sValue)
            ],
            and: false
          }));
        }
        if (this._oViewModel.getProperty("/tableSettings/showSelected")) {
          aFilters.push(new Filter("visible", FilterOperator.EQ, true));
        }
        oBinding.filter(aFilters);
      }
    },

    _loadPersistedPersonalizationStates: function () {
      Object.keys(AnalysisTableConfig.configs).forEach(function (sSection) {
        var oConfig = AnalysisTableConfig.getConfig(sSection);
        this._setPersonalizationState(sSection, this._oTablePersonalization.loadState(oConfig));
      }.bind(this));
    },

    _getPersonalizationState: function (sSection) {
      var oConfig = AnalysisTableConfig.getConfig(sSection);
      var oState = this._oViewModel.getProperty("/tableSettingsState/" + sSection);

      return oState || this._oTablePersonalization.loadState(oConfig);
    },

    _setPersonalizationState: function (sSection, oState) {
      var oConfig = AnalysisTableConfig.getConfig(sSection);

      this._oViewModel.setProperty("/tableSettingsState/" + sSection, oState);
      this._oViewModel.setProperty("/columns/" + sSection, this._oTablePersonalization.toColumnMap(oConfig, oState));
    },

    _buildCapabilityItems: function (sSection, sCapability) {
      return AnalysisTableConfig.getPersonalizableFields(sSection).filter(function (oField) {
        return oField[sCapability] !== false;
      }).map(function (oField) {
        return {
          key: oField.key,
          label: this.getText(oField.labelKey),
          type: oField.type
        };
      }.bind(this));
    },

    _buildDetailSettingsStateFromDialog: function (sSection) {
      var oConfig = AnalysisTableConfig.getConfig(sSection);

      return {
        schemaVersion: 2,
        tableKey: oConfig && oConfig.tableKey,
        columns: (this._oViewModel.getProperty("/tableSettings/items") || []).map(function (oColumn, iIndex) {
          return {
            key: oColumn.fieldKey,
            visible: oColumn.visible === true,
            index: iIndex
          };
        }),
        sorters: this._normalizeCriteria(this._oViewModel.getProperty("/tableSettings/sorters")),
        groups: this._normalizeCriteria(this._oViewModel.getProperty("/tableSettings/groups")),
        filters: this._normalizeCriteria(this._oViewModel.getProperty("/tableSettings/filters"))
      };
    },

    _normalizeCriteria: function (aItems) {
      return (Array.isArray(aItems) ? aItems : []).filter(function (oItem) {
        return oItem && oItem.key;
      }).map(function (oItem, iIndex) {
        return Object.assign({}, oItem, { index: iIndex });
      });
    },

    _validateDetailSettingsState: function (oState) {
      return (oState.columns || []).some(function (oColumn) {
        return oColumn.visible === true;
      });
    },

    _setAllDetailTableColumns: function (bVisible) {
      var aItems = (this._oViewModel.getProperty("/tableSettings/items") || []).map(function (oColumn, iIndex) {
        return Object.assign({}, oColumn, {
          visible: bVisible === true || iIndex === 0
        });
      });

      this._oViewModel.setProperty("/tableSettings/items", aItems);
      this._updateDetailTableSettingsCount();
      this._filterDetailTableSettingsList(this._oViewModel.getProperty("/tableSettings/search"));
    },

    _moveSelectedDetailColumn: function (sDirection) {
      var oList = this.byId("detailTableSettingsList");
      var oItem = oList && oList.getSelectedItem && oList.getSelectedItem();
      var oContext = oItem && oItem.getBindingContext("detail");
      var oColumn = oContext && oContext.getObject();
      var aItems = (this._oViewModel.getProperty("/tableSettings/items") || []).slice();
      var iIndex = aItems.indexOf(oColumn);
      var iTarget = iIndex;

      if (iIndex < 0) {
        return;
      }

      if (sDirection === "top") { iTarget = 0; }
      if (sDirection === "up") { iTarget = Math.max(0, iIndex - 1); }
      if (sDirection === "down") { iTarget = Math.min(aItems.length - 1, iIndex + 1); }
      if (sDirection === "bottom") { iTarget = aItems.length - 1; }

      aItems.splice(iIndex, 1);
      aItems.splice(iTarget, 0, oColumn);
      this._oViewModel.setProperty("/tableSettings/items", this._reindexDetailColumns(aItems));
    },

    _reindexDetailColumns: function (aItems) {
      return (aItems || []).map(function (oColumn, iIndex) {
        return Object.assign({}, oColumn, {
          index: iIndex + 1
        });
      });
    },

    _addDetailCriterion: function (sStateKey, sFieldsKey) {
      var aFields = this._oViewModel.getProperty("/tableSettings/" + sFieldsKey) || [];
      var aItems = (this._oViewModel.getProperty("/tableSettings/" + sStateKey) || []).slice();
      var mUsed = aItems.reduce(function (mResult, oItem) {
        mResult[oItem.key] = true;
        return mResult;
      }, {});
      var oField = aFields.filter(function (oCandidate) {
        return !mUsed[oCandidate.key];
      })[0];

      if (oField) {
        aItems.push({
          key: oField.key,
          descending: false,
          operator: oField.type === "Edm.Boolean" ? "EQ" : "Contains",
          value: "",
          value2: ""
        });
        this._oViewModel.setProperty("/tableSettings/" + sStateKey, aItems);
      }
    },

    _removeDetailCriterion: function (oEvent, sStateKey) {
      var oContext = oEvent.getSource().getBindingContext("detail");
      var oItem = oContext && oContext.getObject();
      var aItems = (this._oViewModel.getProperty("/tableSettings/" + sStateKey) || []).filter(function (oCandidate) {
        return oCandidate !== oItem;
      });

      this._oViewModel.setProperty("/tableSettings/" + sStateKey, aItems);
    },

    _applyTablePersonalization: function (sSection) {
      var oTable = this.byId(this._getDetailTableId(sSection));
      var oBinding = oTable && oTable.getBinding("items");
      var oState = this._getPersonalizationState(sSection);

      if (oBinding) {
        oBinding.sort(this._oTablePersonalization.buildSorters(oState.sorters, oState.groups));
        oBinding.filter(this._oTablePersonalization.buildFilters(oState.filters), "Application");
      }
    },

    _getDetailTableId: function (sSection) {
      return {
        sourceObjects: "sourceObjectsTable",
        uiFilters: "uiFiltersTable",
        databaseObjects: "databaseObjectsTable",
        businessLogic: "businessLogicTable",
        alvOutputs: "alvOutputsTable",
        evidences: "evidencesTable",
        recommendations: "recommendationsTable",
        messages: "messagesTable"
      }[sSection];
    },

    _openDetailTableSettingsDialog: function () {
      if (!this._pDetailTableSettingsDialog) {
        this._pDetailTableSettingsDialog = Fragment.load({
          id: this.getView().getId(),
          name: "abap.to.fiori.system.view.fragments.DetailTableSettings",
          controller: this
        }).then(function (oDialog) {
          this.getView().addDependent(oDialog);
          return oDialog;
        }.bind(this));
      }

      this._pDetailTableSettingsDialog.then(function (oDialog) {
        this._filterDetailTableSettingsList("");
        oDialog.open();
      }.bind(this));
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

    _resetMailWizard: function () {
      this._oMailViewModel.setProperty("/wizard", {
        busy: false,
        mode: "create",
        errorMessage: "",
        job: {
          AnalysisId: "",
          JobName: "",
          ReportType: "",
          FileFormat: MailConstants.fileFormat.excel,
          Frequency: MailConstants.frequency.onDemand,
          StartDate: MailConstants.scheduleDefaults.startDate,
          StartTime: MailConstants.scheduleDefaults.startTime,
          DayOfWeek: MailConstants.scheduleDefaults.dayOfWeek,
          DayOfMonth: MailConstants.scheduleDefaults.dayOfMonth,
          MailSubject: "",
          MailBody: "",
          Status: MailConstants.status.inactive
        },
        recipients: [],
        newRecipient: {
          RecipientType: MailConstants.recipientType.to,
          SapUser: ""
        },
        activateAfterCreate: false
      });
    },

    _prefillMailWizardFromAnalysis: function () {
      var sAnalysisId = this._oViewModel.getProperty("/analysisId");
      var oOverview = this._oViewModel.getProperty("/overview") || {};
      var sProgramName = oOverview.ProgramName || "";

      this._oMailViewModel.setProperty("/wizard/job/AnalysisId", sAnalysisId);
      this._oMailViewModel.setProperty("/wizard/job/ReportType", sProgramName);
      this._oMailViewModel.setProperty("/wizard/job/JobName", sProgramName ? "Mail " + sProgramName : "");
      this._oMailViewModel.setProperty("/wizard/job/MailSubject", sProgramName ? "Migration report " + sProgramName : "");
    },

    _openMailWizard: function () {
      if (!this._pMailWizardDialog) {
        this._pMailWizardDialog = Fragment.load({
          id: this.getView().getId(),
          name: "abap.to.fiori.system.view.fragments.MailJobWizard",
          controller: this
        }).then(function (oDialog) {
          this.getView().addDependent(oDialog);
          return oDialog;
        }.bind(this));
      }

      this._pMailWizardDialog.then(function (oDialog) {
        var oWizard = this.byId("mailJobWizard");
        if (oWizard && oWizard.discardProgress) {
          oWizard.discardProgress(this.byId("mailGeneralStep"));
        }
        oDialog.open();
      }.bind(this));
    },

    _validateMailJob: function (oJob) {
      var aErrors = [];

      if (!oJob.JobName) {
        aErrors.push(this.getText("validationJobNameRequired"));
      }
      if (!oJob.ReportType) {
        aErrors.push(this.getText("validationReportTypeRequired"));
      }
      if (!oJob.FileFormat) {
        aErrors.push(this.getText("validationFileFormatRequired"));
      }
      if (!oJob.MailSubject) {
        aErrors.push(this.getText("validationMailSubjectRequired"));
      }

      aErrors = aErrors.concat(this.getMailService().validateSchedule(oJob, true));

      return aErrors;
    },

    _normalizeMailJob: function (oJob) {
      var oPayload = Object.assign({}, oJob || {});

      if (oPayload.Frequency === MailConstants.frequency.onDemand) {
        oPayload.StartDate = MailConstants.scheduleDefaults.startDate;
        oPayload.StartTime = MailConstants.scheduleDefaults.startTime;
        oPayload.DayOfWeek = MailConstants.scheduleDefaults.dayOfWeek;
        oPayload.DayOfMonth = MailConstants.scheduleDefaults.dayOfMonth;
        return oPayload;
      }

      if (oPayload.Frequency !== MailConstants.frequency.weekly) {
        oPayload.DayOfWeek = "";
      }
      if (oPayload.Frequency !== MailConstants.frequency.monthly) {
        oPayload.DayOfMonth = "";
      } else if (oPayload.DayOfMonth) {
        oPayload.DayOfMonth = String(oPayload.DayOfMonth).padStart(2, "0");
      }

      return oPayload;
    },

    _showMailWizardError: function (oError) {
      var sMessage = this.getMailService().toFriendlyError(oError).message;
      this._oMailViewModel.setProperty("/wizard/busy", false);
      this._oMailViewModel.setProperty("/wizard/errorMessage", sMessage);
      MessageBox.error(sMessage);
    },

    _withMailRequestTimeout: function (pRequest) {
      return Promise.race([
        pRequest,
        new Promise(function (resolve, reject) {
          setTimeout(function () {
            reject(new Error(this.getText("mailRequestTimeout")));
          }.bind(this), 30000);
        }.bind(this))
      ]);
    },

    _getSectionKeyFromId: function (sSectionId) {
      var mSectionIds = {};

      mSectionIds[Constants.section.uiFilters] = "uiFiltersSection";
      mSectionIds[Constants.section.sourceObjects] = "sourceObjectsSection";
      mSectionIds[Constants.section.databaseObjects] = "databaseObjectsSection";
      mSectionIds[Constants.section.businessLogic] = "businessLogicSection";
      mSectionIds[Constants.section.alvOutputs] = "alvOutputsSection";
      mSectionIds[Constants.section.evidences] = "evidencesSection";
      mSectionIds[Constants.section.recommendations] = "recommendationsSection";
      mSectionIds[Constants.section.messages] = "messagesSection";

      return Object.keys(mSectionIds).find(function (sKey) {
        return sSectionId && sSectionId.indexOf(mSectionIds[sKey]) !== -1;
      });
    },

    _setBusy: function (bBusy) {
      this._oViewModel.setProperty("/busy", bBusy);
    },

    _setComparisonProgress: function (bBusy, sState, sMessage) {
      this._oViewModel.setProperty("/comparison/busy", bBusy);
      this._oViewModel.setProperty("/comparison/state", sState);
      this._oViewModel.setProperty("/comparison/message", sMessage || "");
    }
  });
});
