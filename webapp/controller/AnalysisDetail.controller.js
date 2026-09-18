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
  "abap/to/fiori/system/model/AnalysisTableConfig",
  "abap/to/fiori/system/util/TablePersonalizationService",
  "abap/to/fiori/system/util/Constants",
  "abap/to/fiori/system/util/formatter",
  "abap/to/fiori/system/util/AnalysisChatBox",
  "abap/to/fiori/system/util/SourceObjectTree",
  "abap/to/fiori/system/service/LegacyComparisonService",
  "abap/to/fiori/system/util/LegacyComparison",
  "abap/to/fiori/system/util/FioriUiConfig",
  "abap/to/fiori/system/util/FioriUiMetadata",
  "abap/to/fiori/system/util/FioriUiReportConfig",
  "abap/to/fiori/system/util/FioriUiReport",
  "abap/to/fiori/system/util/ODataGeneration",
  "abap/to/fiori/system/util/RequestHistory",
  "sap/ui/Device",
  "sap/base/Log"
], function (Fragment, MessageBox, MessageToast, Filter, FilterOperator, Sorter, BaseController, models, MailConstants, mailFormatter, AnalysisTableConfig, TablePersonalizationService, Constants, formatter, AnalysisChatBox, SourceObjectTree, LegacyComparisonService, LegacyComparison, FioriUiConfig, FioriUiMetadata, FioriUiReportConfig, FioriUiReport, ODataGeneration, RequestHistory, Device, Log) {
  "use strict";

  var REQUEST_POLL_INTERVAL_MS = 20000;
  var FIORI_UI_TARGET_PACKAGE = "ZMIG_GEN_TEST";

    return BaseController.extend(
      "abap.to.fiori.system.controller.AnalysisDetail",
      {
        formatter: formatter,
        mailFormatter: mailFormatter,

    onInit: function () {
      this._oViewModel = models.createAnalysisDetailModel();
      this._oLegacyComparisonService = new LegacyComparisonService(this.getODataModel());
      this._oTablePersonalization = new TablePersonalizationService();
      this.getView().setModel(this._oViewModel, "detail");
      this._oMailViewModel = models.createMailUiModel();
      this.getView().setModel(this._oMailViewModel, "mailUi");
      this._mSourceCodeCache = Object.create(null);
      this._mExpandedSourceObjectKeys = Object.create(null);
      this._onSourceObjectResize();
      Device.resize.attachHandler(this._onSourceObjectResize, this);
      this.getRouter().getRoute("analysisDetail").attachPatternMatched(this._onRouteMatched, this);
      this.getRouter().getRoute("detail").attachPatternMatched(this._onRouteMatched, this);
      this.getRouter().attachRouteMatched(this._onAnyRouteMatched, this);
      this._oChatBox = new AnalysisChatBox(this);
      ["uiFilters", "databaseObjects", "businessLogic"].forEach(function (sSection) {
        var oScroll = this.byId(sSection + "Scroll");
        var sLabel = this.getText(sSection);
        oScroll.addEventDelegate({
          onAfterRendering: function () {
            var oDom = oScroll.getDomRef();
            if (oDom) {
              oDom.setAttribute("tabindex", "0");
              oDom.setAttribute("role", "region");
              oDom.setAttribute("aria-label", sLabel);
            }
          }
        });
      }.bind(this));
    },

        onBackToDashboard: function () {
          this.getRouter().navTo("dashboard");
        },

    onExit: function () {
      if (this._oChatBox) { this._oChatBox.destroy(); }
      Device.resize.detachHandler(this._onSourceObjectResize, this);
      this._iFioriUiRequestVersion = (this._iFioriUiRequestVersion || 0) + 1;
      this._closeFioriUiReport();
      this._bODataGenerationDialogOpen = false;
      this._cancelODataGenerationPolling();
      this._stopRequestHistory();
      this._stopLegacyComparison();
      this.getRouter().detachRouteMatched(this._onAnyRouteMatched, this);
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
          this._loadRequestHistory();
          this._loadHeader().then(
            function () {
              return this._loadAllTabData();
            }.bind(this),
          );
        },

        onOpenExportAllDialog: function () {
          this._resetExportState({
            exportSection: Constants.exportSection.all,
            selectedSection: Constants.exportSection.all,
            sections: this._buildAllExportSectionSelection(),
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
            section: sSection,
          });
          this._openExportDialog();
        },

        onOpenDetailTableSettings: function (oEvent) {
          var sSection = oEvent.getSource().data("section");

          if (!sSection) {
            return;
          }

          this._sDetailTableSettingsSection = sSection;
          this._mDetailSettingsSnapshot = JSON.parse(
            JSON.stringify(
              this._oViewModel.getProperty("/tableSettingsState/" + sSection) ||
                {},
            ),
          );
          this._mDetailColumnSnapshot = Object.assign(
            {},
            this._oViewModel.getProperty("/columns/" + sSection) || {},
          );
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
          this._oViewModel.setProperty(
            "/tableSettings/showSelected",
            !this._oViewModel.getProperty("/tableSettings/showSelected"),
          );
          this._filterDetailTableSettingsList(
            this._oViewModel.getProperty("/tableSettings/search"),
          );
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
          var oDraggedContext =
            oDragged && oDragged.getBindingContext("detail");
          var oDroppedContext =
            oDropped && oDropped.getBindingContext("detail");
          var oDraggedColumn = oDraggedContext && oDraggedContext.getObject();
          var oDroppedColumn = oDroppedContext && oDroppedContext.getObject();
          var aItems = (
            this._oViewModel.getProperty("/tableSettings/items") || []
          ).slice();
          var iDraggedIndex = aItems.indexOf(oDraggedColumn);
          var iDroppedIndex = aItems.indexOf(oDroppedColumn);

          if (
            iDraggedIndex < 0 ||
            iDroppedIndex < 0 ||
            iDraggedIndex === iDroppedIndex
          ) {
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
          this._oViewModel.setProperty(
            "/tableSettings/items",
            this._reindexDetailColumns(aItems),
          );
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
            this.showErrorMessage(this.getText("personalizationAtLeastOneColumn"));
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
          if (
            this._sDetailTableSettingsSection &&
            this._mDetailColumnSnapshot
          ) {
            this._oViewModel.setProperty(
              "/columns/" + this._sDetailTableSettingsSection,
              this._mDetailColumnSnapshot,
            );
          }
          if (
            this._sDetailTableSettingsSection &&
            this._mDetailSettingsSnapshot
          ) {
            this._oViewModel.setProperty(
              "/tableSettingsState/" + this._sDetailTableSettingsSection,
              this._mDetailSettingsSnapshot,
            );
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

        onCancelMailJobWizard: function () {
          this._oMailViewModel.setProperty("/wizard/busy", false);
          this._oMailViewModel.setProperty("/wizard/errorMessage", "");
          this.byId("mailJobWizardDialog").close();
        },

        onAddDraftRecipient: function () {
          var oRecipient = Object.assign(
            {},
            this._oMailViewModel.getProperty("/wizard/newRecipient"),
          );
          var aRecipients = this._oMailViewModel
            .getProperty("/wizard/recipients")
            .slice();

          this._oMailViewModel.setProperty("/wizard/errorMessage", "");
          oRecipient.SapUser = String(oRecipient.SapUser || "").trim();
          oRecipient.RecipientType =
            oRecipient.RecipientType || MailConstants.recipientType.to;

          if (!oRecipient.SapUser) {
            MessageToast.show(this.getText("validationSapUserRequired"));
            return;
          }

          aRecipients.push(oRecipient);
          this._oMailViewModel.setProperty("/wizard/recipients", aRecipients);
          if (aRecipients.length === 1) {
            this._oMailViewModel.setProperty(
              "/wizard/activateAfterCreate",
              true,
            );
          }
          this._oMailViewModel.setProperty("/wizard/newRecipient", {
            RecipientType: MailConstants.recipientType.to,
            SapUser: "",
          });
        },

        onRemoveDraftRecipient: function (oEvent) {
          var oContext = oEvent.getSource().getBindingContext("mailUi");
          var sPath = oContext && oContext.getPath();
          var iIndex = sPath ? Number(sPath.split("/").pop()) : -1;
          var aRecipients = this._oMailViewModel
            .getProperty("/wizard/recipients")
            .slice();

          if (iIndex >= 0) {
            aRecipients.splice(iIndex, 1);
            this._oMailViewModel.setProperty("/wizard/recipients", aRecipients);
            if (!aRecipients.length) {
              this._oMailViewModel.setProperty(
                "/wizard/activateAfterCreate",
                false,
              );
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
            this._oMailViewModel.setProperty(
              "/wizard/errorMessage",
              aErrors.join("\n"),
            );
            this.showErrorMessage(aErrors.join("\n"));
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

    onFrequencyChange: function () {
      var oJob = this.getMailService().normalizeSchedule(this._oMailViewModel.getProperty("/wizard/job") || {});

      this._oMailViewModel.setProperty("/wizard/job", oJob);
      this._applyMailFrequencyUiState(oJob.Frequency);
      this._oMailViewModel.setProperty("/wizard/errorMessage", "");
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
      var bTechnicalDocument = oExport.fileFormat === Constants.technicalDocument.fileFormat;
      var pDownload;

          if (oExport.busy) {
            return;
          }

      if (bTechnicalDocument ? !this._canGenerateTechnicalDocument() : !this._canPrepareSelectedExport()) {
        this.showErrorMessage(this.getText("exportNotAvailable"));
        return;
      }

      if (!bTechnicalDocument && !(oExport.availableSections || []).some(function (oSection) {
        return oSection.selected !== false && (oSection.fields || []).some(function (oField) {
          return oField.selected === true;
        });
      })) {
        this.showErrorMessage(this.getText("exportSelectColumnRequired"));
        return;
      }

      this._oViewModel.setProperty("/export/busy", true);
      pDownload = bTechnicalDocument ?
        this.getDocumentService().downloadTechnicalDocument(this._oViewModel.getProperty("/analysisId"), {
          fileName: sFileName
        }) :
        this.getDocumentService().downloadSelectedExport(this._oViewModel.getProperty("/analysisId"), {
          fileFormat: oExport.fileFormat,
          exportSection: oExport.exportSection,
          selectedFields: sSelectedFields,
          pdfHeaderText: oExport.pdfHeaderText,
          pdfFooterText: oExport.pdfFooterText,
          paperSize: oExport.paperSize,
          orientation: oExport.orientation,
          fontSize: oExport.fontSize,
          fitToPage: oExport.fitToPage,
          splitMultiValue: oExport.splitMultiValue,
          fileName: sFileName
        });

      pDownload.then(function () {
        MessageToast.show(this.getText("exportSuccess"));
        this.byId("exportReportDialog").close();
        this._oViewModel.setProperty("/export/dialogOpen", false);
      }.bind(this)).catch(function (oError) {
        this.showErrorMessage(oError && oError.message || this.getText("exportError"));
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

    onSourceObjectPress: function (oEvent) {
      var oContext = this._getDetailRowContext(oEvent);
      var oTreeNode = oContext && oContext.getObject();
      var oSourceObject = oTreeNode && (oTreeNode.originalData || oTreeNode);

      if (oSourceObject) {
        this._sSelectedSourceObjectKey = oTreeNode.key || SourceObjectTree.getStableKey(oSourceObject);
        this._selectSourceObject(oSourceObject);
        if (this._oViewModel.getProperty("/sourceObjectNarrow")) {
          this._oViewModel.setProperty("/sourceCodeMobileDetail", true);
        }
        this._showSourceCodeSection();
      }
    },

    onSourceObjectTreeUpdateFinished: function () {
      var oTree = this.byId("sourceObjectTree");
      var aItems = oTree && oTree.getItems ? oTree.getItems() : [];

      if (!oTree) {
        return;
      }

      if (!this._bSourceObjectTreeInitialized) {
        oTree.expandToLevel(2);
        this._bSourceObjectTreeInitialized = true;
      } else {
        aItems.forEach(function (oItem, iIndex) {
          var oContext = oItem.getBindingContext("detail");
          var oNode = oContext && oContext.getObject();
          if (oNode && this._mExpandedSourceObjectKeys[oNode.key]) {
            oTree.expand(iIndex);
          }
        }.bind(this));
      }

      aItems.some(function (oItem) {
        var oContext = oItem.getBindingContext("detail");
        var oNode = oContext && oContext.getObject();
        if (oNode && oNode.key === this._sSelectedSourceObjectKey) {
          oTree.setSelectedItem(oItem, true);
          return true;
        }
        return false;
      }.bind(this));
    },

    onSourceObjectToggleOpenState: function (oEvent) {
      var oTree = oEvent.getSource();
      var oItem = oTree.getItems()[oEvent.getParameter("itemIndex")];
      var oContext = oItem && oItem.getBindingContext("detail");
      var oNode = oContext && oContext.getObject();

      if (oNode) {
        if (oEvent.getParameter("expanded")) {
          this._mExpandedSourceObjectKeys[oNode.key] = true;
        } else {
          delete this._mExpandedSourceObjectKeys[oNode.key];
        }
      }
    },

    onBackToSourceObjectTree: function () {
      this._oViewModel.setProperty("/sourceCodeMobileDetail", false);
    },

    onBusinessLogicPress: function (oEvent) {
      var oContext = this._getDetailRowContext(oEvent);
      var oRow = oContext && oContext.getObject();

      if (oRow) {
        this._selectBusinessLogic(oRow);
      }
    },

    onCloseBusinessLogicInlineDetail: function () {
      this._oViewModel.setProperty("/selectedBusinessLogic", null);
      this._oViewModel.setProperty("/businessLogicDetail", {
        loading: false,
        error: null,
        callBindings: []
      });
    },

        onAlvOutputPress: function (oEvent) {
          var oContext = (
            oEvent.getParameter("listItem") || oEvent.getSource()
          ).getBindingContext("detail");
          var oRow = oContext && oContext.getObject();

          if (oRow && oRow.AnalysisId && oRow.OutputId) {
            this.getRouter().navTo("alvOutputDetail", {
              analysisId: encodeURIComponent(oRow.AnalysisId),
              outputId: encodeURIComponent(oRow.OutputId),
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
          var oContext = (
            oEvent.getParameter("listItem") || oEvent.getSource()
          ).getBindingContext("detail");
          var oRecommendation = oContext && oContext.getObject();

      if (oRecommendation) {
        this.getRouter().navTo("recommendationDetail", {
          analysisId: encodeURIComponent(oRecommendation.AnalysisId),
          recommendationId: encodeURIComponent(oRecommendation.RecommendationId)
        });
      }
    },

    onAnalysisHistoryPress: function (oEvent) {
      var oContext = (oEvent.getParameter("listItem") || oEvent.getSource()).getBindingContext("detail");
      var oAnalysis = oContext && oContext.getObject();
      var sAnalysisId = oAnalysis && oAnalysis.AnalysisId;

      if (!sAnalysisId || sAnalysisId === this._oViewModel.getProperty("/analysisId")) {
        return;
      }

      this.getRouter().navTo("analysisDetail", {
        analysisId: encodeURIComponent(sAnalysisId)
      });
    },

        onCloseAlvOutputInlineDetail: function () {
          this._oViewModel.setProperty("/selectedAlvOutput", null);
          this._oViewModel.setProperty("/alvOutputDetail", {
            loading: false,
            error: null,
            columns: [],
            sorts: [],
            filters: [],
            events: [],
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
            annotations: [],
          });
        },

        _onRouteMatched: function (oEvent) {
          var oArguments = oEvent.getParameter("arguments");
          var sAnalysisId = decodeURIComponent(oArguments.analysisId || "");

          this._resetState(sAnalysisId);
          this._bRequestHistoryActive = true;
          this._loadRequestHistory();
          this._loadHeader().then(
            function () {
              var oPending = this._oPendingHistoryRequest;
              if (oPending && RequestHistory.sameId(oPending.analysisId, sAnalysisId)) {
                this._oPendingHistoryRequest = null;
                this._openRequestHistoryDetail(oPending);
              }
              return this._loadAllTabData();
            }.bind(this),
          );
        },

    _resetState: function (sAnalysisId) {
      this._stopRequestHistory();
      this._stopLegacyComparison();
      this._aRequestHistoryServerRows = [];
      this._aRequestHistoryOptimisticRows = [];
      this._aLegacyCapturedRows = null;
      this._sLegacySelectionJson = "";
      this._iFioriUiRequestVersion = (this._iFioriUiRequestVersion || 0) + 1;
      this._closeFioriUiReport();
      this._bODataGenerationDialogOpen = false;
      this._cancelODataGenerationPolling();
      ["fioriUiPrepareDialog", "odataGenerationDialog", "legacyComparisonDialog"].forEach(function (sId) {
        var oDialog = this.byId(sId);
        if (oDialog) { oDialog.close(); }
      }.bind(this));
      this._iSourceCodeRequestToken = (this._iSourceCodeRequestToken || 0) + 1;
      this._mSourceCodeCache = Object.create(null);
      this._mExpandedSourceObjectKeys = Object.create(null);
      this._sSelectedSourceObjectKey = null;
      this._bSourceObjectTreeInitialized = false;
      this._oViewModel.setData(models.createAnalysisDetailModel().getData());
      this._oViewModel.setProperty("/analysisId", sAnalysisId);
      this._onSourceObjectResize();
      this._loadPersistedPersonalizationStates();
      this._refreshExportAvailability();
    },

    _resetLoadedState: function () {
      Object.keys(this._oViewModel.getProperty("/loaded")).forEach(function (sKey) {
        this._oViewModel.setProperty("/loaded/" + sKey, false);
      }.bind(this));
      this._resetSourceCodeDetail();
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
          return this._loadAnalysisHistory(oAnalysis && oAnalysis.ProgramName);
        }.bind(this))
        .catch(function (oError) {
          this.showError(oError, "loadOverviewError");
        }.bind(this))
        .finally(function () {
          this._setBusy(false);
        }.bind(this));
    },

    _loadAnalysisHistory: function (sProgramName) {
      var sCurrentAnalysisId = this._oViewModel.getProperty("/analysisId");

      this._oViewModel.setProperty("/history/busy", true);
      this._oViewModel.setProperty("/errors/history", null);

      return this.getAnalysisService().readAnalysisHistory(sProgramName)
        .then(function (aRows) {
          this._oViewModel.setProperty("/history/items", (aRows || []).map(function (oRow) {
            return Object.assign({}, oRow, {
              IsCurrent: oRow.AnalysisId === sCurrentAnalysisId
            });
          }));
        }.bind(this))
        .catch(function (oError) {
          this._oViewModel.setProperty("/errors/history", oError && oError.message || this.getText("loadAnalysisHistoryError"));
        }.bind(this))
        .finally(function () {
          this._oViewModel.setProperty("/history/busy", false);
        }.bind(this));
    },

        _loadTabData: function (sTabKey) {
          if (this._oViewModel.getProperty("/loaded/" + sTabKey)) {
            return Promise.resolve();
          }

          if (sTabKey === Constants.section.sourceObjects) {
            return this._loadList(
              "sourceObjects",
              "getSourceObjects",
              "loadSourceObjectsError",
            );
          }

          if (sTabKey === Constants.section.uiFilters) {
            return this._loadList(
              "uiFilters",
              "getUiFilters",
              "loadUiFiltersError",
            );
          }

          if (sTabKey === Constants.section.databaseObjects) {
            return this._loadList(
              "databaseObjects",
              "getDatabaseObjects",
              "loadDatabaseError",
            );
          }

          if (sTabKey === Constants.section.businessLogic) {
            return this._loadList(
              "businessLogic",
              "getBusinessLogic",
              "loadBusinessLogicError",
            );
          }

          if (sTabKey === Constants.section.alvOutputs) {
            return this._loadList(
              "alvOutputs",
              "getAlvOutputs",
              "loadAlvOutputsError",
            );
          }

          if (sTabKey === Constants.section.evidences) {
            return this._loadList(
              "evidences",
              "getEvidences",
              "loadEvidencesError",
            );
          }

          if (sTabKey === Constants.section.recommendations) {
            return this._loadList(
              "recommendations",
              "getRecommendations",
              "loadRecommendationsError",
            );
          }

          if (sTabKey === Constants.section.messages) {
            return this._loadList(
              "messages",
              "getMessages",
              "loadMessagesError",
            );
          }

          return Promise.resolve();
        },

        _loadAllTabData: function () {
          return Promise.all(
            Object.keys(this._oViewModel.getProperty("/loaded") || {}).map(
              function (sTabKey) {
                return this._loadTabData(sTabKey);
              }.bind(this),
            ),
          );
        },

        _loadList: function (sStateKey, sServiceMethod, sErrorTextKey) {
          var sAnalysisId = this._oViewModel.getProperty("/analysisId");

          this._oViewModel.setProperty("/loading/" + sStateKey, true);
          this._oViewModel.setProperty("/errors/" + sStateKey, null);

          return this.getAnalysisService()
            [sServiceMethod](sAnalysisId)
            .then(
              function (aRows) {
                this._oViewModel.setProperty("/" + sStateKey, aRows);
                this._oViewModel.setProperty(
                  "/counts/" + sStateKey,
                  aRows.length,
                );
                this._oViewModel.setProperty("/loaded/" + sStateKey, true);
                if (sStateKey === "sourceObjects") {
                  this._updateSourceObjectTree(aRows);
                } else {
                  this._applyTablePersonalization(sStateKey);
                }
              }.bind(this),
            )
            .catch(
              function (oError) {
                this._oViewModel.setProperty(
                  "/errors/" + sStateKey,
                  (oError && oError.message) || this.getText(sErrorTextKey),
                );
              }.bind(this),
            )
            .finally(
              function () {
                this._oViewModel.setProperty("/loading/" + sStateKey, false);
              }.bind(this),
            );
        },

    _showRowText: function (oEvent, sProperty, sTitleKey) {
      var oContext = this._getDetailRowContext(oEvent);
      var oRow = oContext && oContext.getObject();
      var sText = oRow && oRow[sProperty] || this.getText("notAvailable");

      MessageBox.information(sText, {
        title: this.getText(sTitleKey)
      });
    },

    _getDetailRowContext: function (oEvent) {
      var oControl = oEvent && (oEvent.getParameter("listItem") || oEvent.getSource());
      var oContext;

      while (oControl) {
        oContext = oControl.getBindingContext && oControl.getBindingContext("detail");
        if (oContext) {
          return oContext;
        }
        oControl = oControl.getParent && oControl.getParent();
      }

      return null;
    },

    _buildSourceObjectTree: function (aSourceObjects) {
      var oResult = SourceObjectTree.build(aSourceObjects);

      oResult.warnings.forEach(function (sWarning) {
        Log.warning(sWarning, null, "abap.to.fiori.system.util.SourceObjectTree");
      });
      return oResult.roots;
    },

    _updateSourceObjectTree: function (aSourceObjects) {
      var aTree = this._buildSourceObjectTree(aSourceObjects);
      var oSelectedNode;

      this._oViewModel.setProperty("/sourceObjectTree", aTree);

      if (this._sSelectedSourceObjectKey) {
        (function findSelected(aNodes) {
          aNodes.some(function (oNode) {
            if (oNode.key === this._sSelectedSourceObjectKey) {
              oSelectedNode = oNode;
              return true;
            }
            return findSelected.call(this, oNode.children || []);
          }.bind(this));
          return !!oSelectedNode;
        }.call(this, aTree));
      }

      if (oSelectedNode) {
        this._selectSourceObject(oSelectedNode.originalData);
      }
    },

    _selectSourceObject: function (oSourceObject) {
      var sAnalysisId = oSourceObject && oSourceObject.AnalysisId;
      var sSourceItemId = oSourceObject && oSourceObject.ItemId;
      var iRequestedLength = Math.max(Number(oSourceObject && oSourceObject.LineCount) || 0, 10000);
      var sCacheKey = SourceObjectTree.getStableKey(oSourceObject);
      var aEmbeddedLines = oSourceObject && (oSourceObject.SourceLines || oSourceObject._SourceLines);
      var aCachedLines = Array.isArray(aEmbeddedLines) ? this._normalizeSourceLines(aEmbeddedLines) : this._mSourceCodeCache[sCacheKey];
      var iToken;

      this._oViewModel.setProperty("/selectedSourceObject", oSourceObject || null);
      if (aCachedLines) {
        this._oViewModel.setProperty("/sourceCodeDetail", {
          loading: false,
          error: null,
          lines: aCachedLines,
          lineCount: aCachedLines.length
        });
        return;
      }
      this._oViewModel.setProperty("/sourceCodeDetail", {
        loading: true,
        error: null,
        lines: [],
        lineCount: 0
      });

      if (!sAnalysisId || !sSourceItemId) {
        this._oViewModel.setProperty("/sourceCodeDetail", {
          loading: false,
          error: this.getText("loadSourceLinesError"),
          lines: [],
          lineCount: 0
        });
        return;
      }

      iToken = (this._iSourceCodeRequestToken || 0) + 1;
      this._iSourceCodeRequestToken = iToken;

      this.getAnalysisService().getSourceLines(sAnalysisId, sSourceItemId, iRequestedLength)
        .then(function (aRows) {
          var aLines;

          if (iToken !== this._iSourceCodeRequestToken) {
            return;
          }

          aLines = this._normalizeSourceLines(aRows);
          this._mSourceCodeCache[sCacheKey] = aLines;
          this._oViewModel.setProperty("/sourceCodeDetail/lines", aLines);
          this._oViewModel.setProperty("/sourceCodeDetail/lineCount", aLines.length);
        }.bind(this))
        .catch(function (oError) {
          if (iToken !== this._iSourceCodeRequestToken) {
            return;
          }

          this._oViewModel.setProperty("/sourceCodeDetail/error", oError && oError.message || this.getText("loadSourceLinesError"));
        }.bind(this))
        .finally(function () {
          if (iToken === this._iSourceCodeRequestToken) {
            this._oViewModel.setProperty("/sourceCodeDetail/loading", false);
          }
        }.bind(this));
    },

    _normalizeSourceLines: function (aRows) {
      return (aRows || []).slice().sort(function (a, b) {
        return Number(a && a.LineNumber || 0) - Number(b && b.LineNumber || 0);
      }).map(function (oRow) {
        return Object.assign({}, oRow, {
          SourceText: oRow && oRow.SourceText !== null && oRow.SourceText !== undefined ? String(oRow.SourceText) : ""
        });
      });
    },

    _resetSourceCodeDetail: function () {
      this._iSourceCodeRequestToken = (this._iSourceCodeRequestToken || 0) + 1;
      this._oViewModel.setProperty("/selectedSourceObject", null);
      this._oViewModel.setProperty("/sourceCodeDetail", {
        loading: false,
        error: null,
        lines: [],
        lineCount: 0
      });
    },

    _showSourceCodeSection: function () {
      var oPage = this.byId("analysisDetailPage");
      var oSubSection = this.byId("sourceCodeSubSection");

      if (oPage && oSubSection && typeof oPage.scrollToSection === "function") {
        oPage.scrollToSection(oSubSection.getId());
      }
    },

    _onSourceObjectResize: function (oEvent) {
      var iWidth = oEvent && oEvent.size && oEvent.size.width || Device.resize.width;
      this._oViewModel.setProperty("/sourceObjectNarrow", iWidth <= 900);
    },

    _selectBusinessLogic: function (oRow) {
      var sAnalysisId = oRow && oRow.AnalysisId;
      var sItemId = oRow && oRow.ItemId;

      this._oViewModel.setProperty("/selectedBusinessLogic", oRow || null);
      this._oViewModel.setProperty("/businessLogicDetail", {
        loading: true,
        error: null,
        callBindings: []
      });

      if (!sAnalysisId || !sItemId) {
        this._oViewModel.setProperty("/businessLogicDetail", {
          loading: false,
          error: this.getText("loadCallBindingsError"),
          callBindings: []
        });
        return;
      }

      this.getAnalysisService().getBusinessLogicCallBindings(sAnalysisId, sItemId)
        .then(function (aRows) {
          this._oViewModel.setProperty("/businessLogicDetail/callBindings", aRows || []);
        }.bind(this))
        .catch(function (oError) {
          this._oViewModel.setProperty("/businessLogicDetail/error", oError && oError.message || this.getText("loadCallBindingsError"));
        }.bind(this))
        .finally(function () {
          this._oViewModel.setProperty("/businessLogicDetail/loading", false);
        }.bind(this));
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
            events: [],
          });

          Promise.all([
            this.getAnalysisService().getAlvOutputChildren(
              sAnalysisId,
              sOutputId,
              "alvColumns",
            ),
            this.getAnalysisService().getAlvOutputChildren(
              sAnalysisId,
              sOutputId,
              "alvSorts",
            ),
            this.getAnalysisService().getAlvOutputChildren(
              sAnalysisId,
              sOutputId,
              "alvFilters",
            ),
            this.getAnalysisService().getAlvOutputChildren(
              sAnalysisId,
              sOutputId,
              "alvEvents",
            ),
          ])
            .then(
              function (aResults) {
                this._oViewModel.setProperty(
                  "/alvOutputDetail/columns",
                  aResults[0] || [],
                );
                this._oViewModel.setProperty(
                  "/alvOutputDetail/sorts",
                  aResults[1] || [],
                );
                this._oViewModel.setProperty(
                  "/alvOutputDetail/filters",
                  aResults[2] || [],
                );
                this._oViewModel.setProperty(
                  "/alvOutputDetail/events",
                  aResults[3] || [],
                );
              }.bind(this),
            )
            .catch(
              function (oError) {
                this._oViewModel.setProperty(
                  "/alvOutputDetail/error",
                  (oError && oError.message) ||
                    this.getText("loadAlvOutputsError"),
                );
              }.bind(this),
            )
            .finally(
              function () {
                this._oViewModel.setProperty("/alvOutputDetail/loading", false);
              }.bind(this),
            );
        },

        _selectRecommendation: function (oRecommendation) {
          var sAnalysisId = oRecommendation && oRecommendation.AnalysisId;
          var sRecommendationId =
            oRecommendation && oRecommendation.RecommendationId;

          this._oViewModel.setProperty(
            "/selectedRecommendation",
            oRecommendation,
          );
          this._oViewModel.setProperty("/recommendationDetail", {
            loading: true,
            error: null,
            annotations: [],
          });

          this.getAnalysisService()
            .getRecommendationAnnotations(sAnalysisId, sRecommendationId)
            .then(
              function (aRows) {
                this._oViewModel.setProperty(
                  "/recommendationDetail/annotations",
                  aRows || [],
                );
              }.bind(this),
            )
            .catch(
              function (oError) {
                this._oViewModel.setProperty(
                  "/recommendationDetail/error",
                  (oError && oError.message) ||
                    this.getText("loadRecommendationsError"),
                );
              }.bind(this),
            )
            .finally(
              function () {
                this._oViewModel.setProperty(
                  "/recommendationDetail/loading",
                  false,
                );
              }.bind(this),
            );
        },

    _resetExportState: function (mOptions) {
      var sSelectedSection = mOptions && mOptions.section || this._oViewModel.getProperty("/selectedTab") || Constants.section.sourceObjects;
      var oConfig = AnalysisTableConfig.getConfig(sSelectedSection);
      var aSections = mOptions && mOptions.sections || this._buildSectionExportSelection(sSelectedSection);
      var aFields = this._flattenExportSections(aSections);
      var sFileFormat = Constants.fileFormat.excel;
      var sExportSection = mOptions && mOptions.exportSection || oConfig && oConfig.exportSection || "";
      var sReportType = this._oViewModel.getProperty("/overview/ProgramName") || "";
      var mExportDefaults = Constants.exportDefaults;
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
        pdfHeaderText: mExportDefaults.pdfHeaderText,
        pdfFooterText: mExportDefaults.pdfFooterText,
        paperSize: mExportDefaults.paperSize,
        orientation: mExportDefaults.orientation,
        fontSize: mExportDefaults.fontSize,
        fitToPage: mExportDefaults.fitToPage,
        splitMultiValue: mExportDefaults.splitMultiValue,
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
        exportSection: oExport.fileFormat === Constants.technicalDocument.fileFormat ?
          Constants.exportSection.all : oExport.exportSection || Constants.exportSection.all
      });

          this._oViewModel.setProperty(
            "/export/defaultFileName",
            sDefaultFileName,
          );
          if (
            !String(sCurrentFileName).trim() ||
            sCurrentFileName === sPreviousDefault
          ) {
            this._oViewModel.setProperty("/export/fileName", sDefaultFileName);
          }
        },

        _getExportFileName: function (oExport) {
          var sFileName = String((oExport && oExport.fileName) || "").trim();

      return sFileName || oExport && oExport.defaultFileName || this.getDocumentService().getFallbackFileName({
        reportType: oExport && oExport.reportType,
        fileFormat: oExport && oExport.fileFormat,
        exportSection: oExport && oExport.fileFormat === Constants.technicalDocument.fileFormat ?
          Constants.exportSection.all : oExport && oExport.exportSection || Constants.exportSection.all
      });
    },

        onExportFieldSelectionChange: function () {
          setTimeout(
            function () {
              this._syncExportSelection();
            }.bind(this),
            0,
          );
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
          aFields.forEach(
            function (oField, iIndex) {
              this._oViewModel.setProperty(
                sPath + "/fields/" + iIndex + "/selected",
                bSelected,
              );
            }.bind(this),
          );
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

          aFields =
            this._oViewModel.getProperty(sSectionPath + "/fields") || [];
          bAnySelected = aFields.some(function (oField) {
            return oField.selected === true;
          });
          this._oViewModel.setProperty(
            sSectionPath + "/selected",
            bAnySelected,
          );
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
              controller: this,
            }).then(
              function (oDialog) {
                this.getView().addDependent(oDialog);
                return oDialog;
              }.bind(this),
            );
          }

          this._pExportDialog.then(
            function (oDialog) {
              this._oViewModel.setProperty("/export/dialogOpen", true);
              oDialog.open();
            }.bind(this),
          );
        },

    _buildExportFieldSelection: function (sSection) {
      var oConfig = AnalysisTableConfig.getConfig(sSection);
      var oState = this._getPersonalizationState(sSection);
      var aVisibleFields = oConfig ? this._oTablePersonalization.getVisibleExportableFields(oConfig, oState) : [];
      var mVisibleFields = {};
      var mFields = {};
      var aFields;

      aVisibleFields.forEach(function (oField) {
        mVisibleFields[oField.key] = true;
      });
      (oConfig && oConfig.fields || []).forEach(function (oField) {
        mFields[oField.key] = oField;
      });
      aFields = (oConfig && oConfig.exportFields || []).map(function (sKey) {
        return mFields[sKey];
      }).filter(Boolean);

      return aFields.map(function (oField) {
        return {
          key: oField.key,
          label: this.getText(oField.labelKey),
          selected: mVisibleFields[oField.key] === true,
          priority: oField.priority
        };
      }.bind(this));
    },

        _buildAllExportFieldSelection: function () {
          var mSeen = {};
          var aFields = [];

          Object.keys(AnalysisTableConfig.configs).forEach(
            function (sSection) {
              if (!this._isSectionExportAvailable(sSection)) {
                return;
              }

              this._buildExportFieldSelection(sSection).forEach(
                function (oField) {
                  var sKey = oField.key;
                  if (!mSeen[sKey]) {
                    mSeen[sKey] = true;
                    aFields.push(
                      Object.assign({}, oField, {
                        label:
                          this._getExportSectionLabel(sSection) +
                          " - " +
                          oField.label,
                      }),
                    );
                  }
                }.bind(this),
              );
            }.bind(this),
          );

          return aFields;
        },

        _buildSectionExportSelection: function (sSection) {
          var oConfig = AnalysisTableConfig.getConfig(sSection);
          var aFields = this._buildExportFieldSelection(sSection);

          if (!oConfig || !oConfig.exportSection || !aFields.length) {
            return [];
          }

          return [
            {
              key: sSection,
              label: this._getExportSectionLabel(sSection),
              exportSection: oConfig.exportSection,
              selected: true,
              fields: aFields,
            },
          ];
        },

        _buildAllExportSectionSelection: function () {
          return Object.keys(AnalysisTableConfig.configs)
            .map(
              function (sSection) {
                return this._buildSectionExportSelection(sSection)[0];
              }.bind(this),
            )
            .filter(Boolean);
        },

        _getSelectedExportFieldKeys: function () {
          return (
            this._flattenExportSections(
              this._oViewModel.getProperty("/export/availableSections"),
            ) || []
          )
            .filter(function (oField) {
              return oField.selected === true;
            })
            .map(function (oField) {
              return oField.key;
            })
            .filter(function (sKey, iIndex, aKeys) {
              return aKeys.indexOf(sKey) === iIndex;
            });
        },

        _getSelectedExportFieldExpression: function () {
          var oExport = this._oViewModel.getProperty("/export") || {};
          var aSections =
            this._oViewModel.getProperty("/export/availableSections") || [];

          if (oExport.exportSection === Constants.exportSection.all) {
            return aSections
              .filter(function (oSection) {
                return oSection && oSection.selected !== false;
              })
              .map(function (oSection) {
                var aFields = (oSection.fields || [])
                  .filter(function (oField) {
                    return oField.selected === true;
                  })
                  .map(function (oField) {
                    return oField.key;
                  });

                return aFields.length
                  ? oSection.exportSection + ":" + aFields.join(",")
                  : "";
              })
              .filter(Boolean)
              .join(";");
          }

          return this._getSelectedExportFieldKeys().join(",");
        },

        _setAllExportFieldsSelected: function (bSelected) {
          var aSections = (
            this._oViewModel.getProperty("/export/availableSections") || []
          ).map(function (oSection) {
            return Object.assign({}, oSection, {
              selected: bSelected,
              fields: (oSection.fields || []).map(function (oField) {
                return Object.assign({}, oField, {
                  selected: bSelected,
                });
              }),
            });
          });

          this._oViewModel.setProperty("/export/availableSections", aSections);
          this._syncExportSelection();
        },

        _syncExportSelection: function () {
          var aSections =
            this._oViewModel.getProperty("/export/availableSections") || [];
          var aFields = this._flattenExportSections(aSections);

          this._oViewModel.setProperty("/export/availableFields", aFields);
          this._oViewModel.setProperty(
            "/export/selectedFields",
            this._getSelectedExportFieldKeys(),
          );
        },

        _flattenExportSections: function (aSections) {
          return (aSections || []).reduce(function (aResult, oSection) {
            if (!oSection || oSection.selected === false) {
              return aResult;
            }
            return aResult.concat(
              (oSection.fields || []).map(function (oField) {
                return Object.assign({}, oField, {
                  section: oSection.key,
                  sectionLabel: oSection.label,
                  selected:
                    oSection.selected !== false && oField.selected === true,
                });
              }),
            );
          }, []);
        },

    _canPrepareSelectedExport: function () {
      var oControl = this._oViewModel.getProperty("/overview/__OperationControl");
      return oControl && oControl.PrepareSelectedExport === true;
    },

    _canGenerateTechnicalDocument: function () {
      var oControl = this._oViewModel.getProperty("/overview/__OperationControl");
      return oControl && oControl.GenerateTechnicalDocument === true;
    },

        _refreshExportAvailability: function () {
          var mAvailability = {};
          var bAnyAvailable = false;

          Object.keys(AnalysisTableConfig.configs).forEach(
            function (sSection) {
              mAvailability[sSection] =
                this._isSectionExportAvailable(sSection);
              bAnyAvailable = bAnyAvailable || mAvailability[sSection];
            }.bind(this),
          );
          mAvailability.all = bAnyAvailable;

          this._oViewModel.setProperty("/exportAvailable", mAvailability);
        },

        _isSectionExportAvailable: function (sSection) {
          var oConfig = AnalysisTableConfig.getConfig(sSection);

          return !!(
            oConfig &&
            oConfig.exportSection &&
            this._buildExportFieldSelection(sSection).length
          );
        },

        _getExportSectionLabel: function (sSection) {
          var oConfig = AnalysisTableConfig.getConfig(sSection);

          return oConfig
            ? this.getText(oConfig.titleKey)
            : String(sSection || "");
        },

        _getDetailColumnSettings: function (sSection) {
          var oConfig = AnalysisTableConfig.getConfig(sSection);

          if (oConfig) {
            return {
              title: this.getText(oConfig.titleKey),
              columns: AnalysisTableConfig.getPersonalizableFields(
                sSection,
              ).map(
                function (oField) {
                  return {
                    key: oField.stateKey,
                    fieldKey: oField.key,
                    label: this.getText(oField.labelKey),
                    priority: oField.priority,
                    defaultVisible: oField.defaultVisible === true,
                    exportable: oField.exportable !== false,
                  };
                }.bind(this),
              ),
            };
          }

          var mSettings = {
            uiFilters: {
              title: this.getText("uiFilters"),
              columns: [
                {
                  key: "fieldName",
                  label: this.getText("fieldName"),
                  defaultVisible: true,
                },
                {
                  key: "fieldKind",
                  label: this.getText("fieldKind"),
                  defaultVisible: true,
                },
                {
                  key: "dataElement",
                  label: this.getText("dataElement"),
                  defaultVisible: true,
                },
                {
                  key: "selectionBlock",
                  label: this.getText("selectionBlock"),
                  defaultVisible: true,
                },
                {
                  key: "mandatory",
                  label: this.getText("mandatory"),
                  defaultVisible: true,
                },
                {
                  key: "multipleSelection",
                  label: this.getText("multipleSelection"),
                  defaultVisible: true,
                },
                {
                  key: "confidence",
                  label: this.getText("confidence"),
                  defaultVisible: true,
                },
              ],
            },
            databaseObjects: {
              title: this.getText("databaseObjects"),
              columns: [
                {
                  key: "objectName",
                  label: this.getText("objectName"),
                  defaultVisible: true,
                },
                {
                  key: "objectType",
                  label: this.getText("objectType"),
                  defaultVisible: true,
                },
                {
                  key: "operation",
                  label: this.getText("operation"),
                  defaultVisible: true,
                },
                {
                  key: "containingRoutine",
                  label: this.getText("containingRoutine"),
                  defaultVisible: true,
                },
                {
                  key: "pagingCapability",
                  label: this.getText("pagingCapability"),
                  defaultVisible: true,
                },
                {
                  key: "confidence",
                  label: this.getText("confidence"),
                  defaultVisible: true,
                },
              ],
            },
            businessLogic: {
              title: this.getText("businessLogic"),
              columns: [
                {
                  key: "objectName",
                  label: this.getText("objectName"),
                  defaultVisible: true,
                },
                {
                  key: "objectType",
                  label: this.getText("objectType"),
                  defaultVisible: true,
                },
                {
                  key: "containerName",
                  label: this.getText("containerName"),
                  defaultVisible: true,
                },
                {
                  key: "callingRoutine",
                  label: this.getText("callingRoutine"),
                  defaultVisible: true,
                },
                {
                  key: "reuseFeasibility",
                  label: this.getText("reuseFeasibility"),
                  defaultVisible: true,
                },
                {
                  key: "confidence",
                  label: this.getText("confidence"),
                  defaultVisible: true,
                },
              ],
            },
            alvOutputs: {
              title: this.getText("alvOutputs"),
              columns: [
                {
                  key: "outputName",
                  label: this.getText("outputName"),
                  defaultVisible: true,
                },
                {
                  key: "outputKind",
                  label: this.getText("outputKind"),
                  defaultVisible: true,
                },
                {
                  key: "framework",
                  label: this.getText("framework"),
                  defaultVisible: true,
                },
                {
                  key: "controlObject",
                  label: this.getText("controlObject"),
                  defaultVisible: true,
                },
                {
                  key: "outputTable",
                  label: this.getText("outputTable"),
                  defaultVisible: true,
                },
                {
                  key: "editable",
                  label: this.getText("editable"),
                  defaultVisible: true,
                },
                {
                  key: "confidence",
                  label: this.getText("confidence"),
                  defaultVisible: true,
                },
              ],
            },
            evidences: {
              title: this.getText("evidence"),
              columns: [
                {
                  key: "sourceObject",
                  label: this.getText("sourceObject"),
                  defaultVisible: true,
                },
                {
                  key: "startLine",
                  label: this.getText("startLine"),
                  defaultVisible: true,
                },
                {
                  key: "endLine",
                  label: this.getText("endLine"),
                  defaultVisible: true,
                },
                {
                  key: "statementId",
                  label: this.getText("statementId"),
                  defaultVisible: true,
                },
                {
                  key: "statementText",
                  label: this.getText("statementText"),
                  defaultVisible: true,
                },
              ],
            },
            recommendations: {
              title: this.getText("recommendationsTabTitle"),
              columns: [
                {
                  key: "severity",
                  label: this.getText("severity"),
                  defaultVisible: true,
                },
                {
                  key: "targetLayer",
                  label: this.getText("targetLayer"),
                  defaultVisible: true,
                },
                {
                  key: "title",
                  label: this.getText("title"),
                  defaultVisible: true,
                },
                {
                  key: "ruleId",
                  label: this.getText("ruleId"),
                  defaultVisible: true,
                },
                {
                  key: "confidence",
                  label: this.getText("confidence"),
                  defaultVisible: true,
                },
              ],
            },
            messages: {
              title: this.getText("messages"),
              columns: [
                {
                  key: "messageNo",
                  label: this.getText("messageNo"),
                  defaultVisible: true,
                },
                {
                  key: "messageType",
                  label: this.getText("messageType"),
                  defaultVisible: true,
                },
                {
                  key: "messageCode",
                  label: this.getText("messageCode"),
                  defaultVisible: true,
                },
                {
                  key: "sourceObject",
                  label: this.getText("sourceObject"),
                  defaultVisible: true,
                },
                {
                  key: "sourceLine",
                  label: this.getText("sourceLine"),
                  defaultVisible: true,
                },
                {
                  key: "messageText",
                  label: this.getText("messageText"),
                  defaultVisible: true,
                },
              ],
            },
          };

          return (
            mSettings[sSection] || {
              title: this.getText("viewSettings"),
              columns: [],
            }
          );
        },

        _prepareDetailTableSettings: function (sSection) {
          var oSettings = this._getDetailColumnSettings(sSection);
          var oState =
            arguments.length > 1
              ? arguments[1]
              : this._getPersonalizationState(sSection);
          var mColumnState = {};
          var aItems;

          (oState.columns || []).forEach(function (oColumn) {
            mColumnState[oColumn.key] = oColumn;
          });

          aItems = oSettings.columns
            .map(function (oColumn) {
              var oColumnState = mColumnState[oColumn.fieldKey] || {};
              return Object.assign({}, oColumn, {
                visible: oColumnState.visible === true,
                index:
                  typeof oColumnState.index === "number"
                    ? oColumnState.index
                    : 999,
              });
            })
            .sort(function (a, b) {
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
            totalCount: aItems.length,
          });
        },

        _updateDetailTableSettingsCount: function () {
          var sSection = this._sDetailTableSettingsSection;
          var aItems =
            this._oViewModel.getProperty("/tableSettings/items") || [];

          if (!sSection) {
            return;
          }

          aItems.forEach(
            function (oColumn) {
              this._oViewModel.setProperty(
                "/columns/" + sSection + "/" + oColumn.key,
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

        _filterDetailTableSettingsList: function (sSearch) {
          var oList = this.byId("detailTableSettingsList");
          var oBinding = oList && oList.getBinding("items");
          var sValue = String(sSearch || "").trim();
          var aFilters = [];

          this._oViewModel.setProperty("/tableSettings/search", sValue);

          if (oBinding) {
            if (sValue) {
              aFilters.push(
                new Filter({
                  filters: [
                    new Filter("label", FilterOperator.Contains, sValue),
                    new Filter("fieldKey", FilterOperator.Contains, sValue),
                  ],
                  and: false,
                }),
              );
            }
            if (this._oViewModel.getProperty("/tableSettings/showSelected")) {
              aFilters.push(new Filter("visible", FilterOperator.EQ, true));
            }
            oBinding.filter(aFilters);
          }
        },

        _loadPersistedPersonalizationStates: function () {
          Object.keys(AnalysisTableConfig.configs).forEach(
            function (sSection) {
              var oConfig = AnalysisTableConfig.getConfig(sSection);
              this._setPersonalizationState(
                sSection,
                this._oTablePersonalization.loadState(oConfig),
              );
            }.bind(this),
          );
        },

        _getPersonalizationState: function (sSection) {
          var oConfig = AnalysisTableConfig.getConfig(sSection);
          var oState = this._oViewModel.getProperty(
            "/tableSettingsState/" + sSection,
          );

          return oState || this._oTablePersonalization.loadState(oConfig);
        },

        _setPersonalizationState: function (sSection, oState) {
          var oConfig = AnalysisTableConfig.getConfig(sSection);

          this._oViewModel.setProperty(
            "/tableSettingsState/" + sSection,
            oState,
          );
          this._oViewModel.setProperty(
            "/columns/" + sSection,
            this._oTablePersonalization.toColumnMap(oConfig, oState),
          );
        },

        _buildCapabilityItems: function (sSection, sCapability) {
          return AnalysisTableConfig.getPersonalizableFields(sSection)
            .filter(function (oField) {
              return oField[sCapability] !== false;
            })
            .map(
              function (oField) {
                return {
                  key: oField.key,
                  label: this.getText(oField.labelKey),
                  type: oField.type,
                };
              }.bind(this),
            );
        },

        _buildDetailSettingsStateFromDialog: function (sSection) {
          var oConfig = AnalysisTableConfig.getConfig(sSection);

          return {
            schemaVersion: 2,
            tableKey: oConfig && oConfig.tableKey,
            columns: (
              this._oViewModel.getProperty("/tableSettings/items") || []
            ).map(function (oColumn, iIndex) {
              return {
                key: oColumn.fieldKey,
                visible: oColumn.visible === true,
                index: iIndex,
              };
            }),
            sorters: this._normalizeCriteria(
              this._oViewModel.getProperty("/tableSettings/sorters"),
            ),
            groups: this._normalizeCriteria(
              this._oViewModel.getProperty("/tableSettings/groups"),
            ),
            filters: this._normalizeCriteria(
              this._oViewModel.getProperty("/tableSettings/filters"),
            ),
          };
        },

        _normalizeCriteria: function (aItems) {
          return (Array.isArray(aItems) ? aItems : [])
            .filter(function (oItem) {
              return oItem && oItem.key;
            })
            .map(function (oItem, iIndex) {
              return Object.assign({}, oItem, { index: iIndex });
            });
        },

        _validateDetailSettingsState: function (oState) {
          return (oState.columns || []).some(function (oColumn) {
            return oColumn.visible === true;
          });
        },

        _setAllDetailTableColumns: function (bVisible) {
          var aItems = (
            this._oViewModel.getProperty("/tableSettings/items") || []
          ).map(function (oColumn, iIndex) {
            return Object.assign({}, oColumn, {
              visible: bVisible === true || iIndex === 0,
            });
          });

          this._oViewModel.setProperty("/tableSettings/items", aItems);
          this._updateDetailTableSettingsCount();
          this._filterDetailTableSettingsList(
            this._oViewModel.getProperty("/tableSettings/search"),
          );
        },

        _moveSelectedDetailColumn: function (sDirection) {
          var oList = this.byId("detailTableSettingsList");
          var oItem = oList && oList.getSelectedItem && oList.getSelectedItem();
          var oContext = oItem && oItem.getBindingContext("detail");
          var oColumn = oContext && oContext.getObject();
          var aItems = (
            this._oViewModel.getProperty("/tableSettings/items") || []
          ).slice();
          var iIndex = aItems.indexOf(oColumn);
          var iTarget = iIndex;

          if (iIndex < 0) {
            return;
          }

          if (sDirection === "top") {
            iTarget = 0;
          }
          if (sDirection === "up") {
            iTarget = Math.max(0, iIndex - 1);
          }
          if (sDirection === "down") {
            iTarget = Math.min(aItems.length - 1, iIndex + 1);
          }
          if (sDirection === "bottom") {
            iTarget = aItems.length - 1;
          }

          aItems.splice(iIndex, 1);
          aItems.splice(iTarget, 0, oColumn);
          this._oViewModel.setProperty(
            "/tableSettings/items",
            this._reindexDetailColumns(aItems),
          );
        },

        _reindexDetailColumns: function (aItems) {
          return (aItems || []).map(function (oColumn, iIndex) {
            return Object.assign({}, oColumn, {
              index: iIndex + 1,
            });
          });
        },

        _addDetailCriterion: function (sStateKey, sFieldsKey) {
          var aFields =
            this._oViewModel.getProperty("/tableSettings/" + sFieldsKey) || [];
          var aItems = (
            this._oViewModel.getProperty("/tableSettings/" + sStateKey) || []
          ).slice();
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
              value2: "",
            });
            this._oViewModel.setProperty("/tableSettings/" + sStateKey, aItems);
          }
        },

        _removeDetailCriterion: function (oEvent, sStateKey) {
          var oContext = oEvent.getSource().getBindingContext("detail");
          var oItem = oContext && oContext.getObject();
          var aItems = (
            this._oViewModel.getProperty("/tableSettings/" + sStateKey) || []
          ).filter(function (oCandidate) {
            return oCandidate !== oItem;
          });

          this._oViewModel.setProperty("/tableSettings/" + sStateKey, aItems);
        },

        _applyTablePersonalization: function (sSection) {
          var oTable = this.byId(this._getDetailTableId(sSection));
          var oBinding = oTable && oTable.getBinding("items");
          var oState = this._getPersonalizationState(sSection);

          if (oBinding) {
            oBinding.sort(
              this._oTablePersonalization.buildSorters(
                oState.sorters,
                oState.groups,
              ),
            );
            oBinding.filter(
              this._oTablePersonalization.buildFilters(oState.filters),
              "Application",
            );
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
            messages: "messagesTable",
          }[sSection];
        },

        _openDetailTableSettingsDialog: function () {
          if (!this._pDetailTableSettingsDialog) {
            this._pDetailTableSettingsDialog = Fragment.load({
              id: this.getView().getId(),
              name: "abap.to.fiori.system.view.fragments.DetailTableSettings",
              controller: this,
            }).then(
              function (oDialog) {
                this.getView().addDependent(oDialog);
                return oDialog;
              }.bind(this),
            );
          }

          this._pDetailTableSettingsDialog.then(
            function (oDialog) {
              this._filterDetailTableSettingsList("");
              oDialog.open();
            }.bind(this),
          );
        },

        _openRecommendationDetailDialog: function () {
          if (!this._pRecommendationDetailDialog) {
            this._pRecommendationDetailDialog = Fragment.load({
              id: this.getView().getId(),
              name: "abap.to.fiori.system.view.fragments.detail.RecommendationDetail",
              controller: this,
            }).then(
              function (oDialog) {
                this.getView().addDependent(oDialog);
                return oDialog;
              }.bind(this),
            );
          }

      this._pRecommendationDetailDialog.then(function (oDialog) {
        oDialog.open();
      });
    },

    _resetMailWizard: function () {
      var oJob = this.getMailService().normalizeSchedule({
        AnalysisId: "",
        JobName: "",
        ReportType: "",
        FileFormat: MailConstants.fileFormat.excel,
        Frequency: MailConstants.frequency.onDemand,
        StartDate: MailConstants.scheduleDefaults.startDate,
        StartTime: MailConstants.scheduleDefaults.startTime,
        JobTimeZone: MailConstants.scheduleDefaults.jobTimeZone,
        DayOfWeek: MailConstants.scheduleDefaults.dayOfWeek,
        DayOfMonth: MailConstants.scheduleDefaults.dayOfMonth,
        MailSubject: "",
        MailBody: "",
        Status: MailConstants.status.inactive
      });

      this._oMailViewModel.setProperty("/wizard", {
        busy: false,
        mode: "create",
        errorMessage: "",
        job: oJob,
        schedule: this.getMailService().getFrequencyUiState(oJob.Frequency),
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

          this._oMailViewModel.setProperty(
            "/wizard/job/AnalysisId",
            sAnalysisId,
          );
          this._oMailViewModel.setProperty(
            "/wizard/job/ReportType",
            sProgramName,
          );
          this._oMailViewModel.setProperty(
            "/wizard/job/JobName",
            sProgramName ? "Mail " + sProgramName : "",
          );
          this._oMailViewModel.setProperty(
            "/wizard/job/MailSubject",
            sProgramName ? "Migration report " + sProgramName : "",
          );
        },

        _openMailWizard: function () {
          if (!this._pMailWizardDialog) {
            this._pMailWizardDialog = Fragment.load({
              id: this.getView().getId(),
              name: "abap.to.fiori.system.view.fragments.MailJobWizard",
              controller: this,
            }).then(
              function (oDialog) {
                this.getView().addDependent(oDialog);
                return oDialog;
              }.bind(this),
            );
          }

          this._pMailWizardDialog.then(
            function (oDialog) {
              var oWizard = this.byId("mailJobWizard");
              if (oWizard && oWizard.discardProgress) {
                oWizard.discardProgress(this.byId("mailGeneralStep"));
              }
              oDialog.open();
            }.bind(this),
          );
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

          aErrors = aErrors.concat(
            this.getMailService().validateSchedule(oJob, true),
          );

          return aErrors;
        },

    _normalizeMailJob: function (oJob) {
      return this.getMailService().normalizeSchedule(oJob);
    },

    _applyMailFrequencyUiState: function (sFrequency) {
      this._oMailViewModel.setProperty("/wizard/schedule", this.getMailService().getFrequencyUiState(sFrequency));
    },

        _showMailWizardError: function (oError) {
          var sMessage = this.getMailService().toFriendlyError(oError).message;
          this._oMailViewModel.setProperty("/wizard/busy", false);
          this._oMailViewModel.setProperty("/wizard/errorMessage", sMessage);
          this.showErrorMessage(sMessage);
        },

        _withMailRequestTimeout: function (pRequest) {
          return Promise.race([
            pRequest,
            new Promise(
              function (resolve, reject) {
                setTimeout(
                  function () {
                    reject(new Error(this.getText("mailRequestTimeout")));
                  }.bind(this),
                  30000,
                );
              }.bind(this),
            ),
          ]);
        },

        _getSectionKeyFromId: function (sSectionId) {
          var mSectionIds = {};

          mSectionIds[Constants.section.uiFilters] = "uiFiltersSection";
          mSectionIds[Constants.section.sourceObjects] = "sourceStructureSection";
          mSectionIds[Constants.section.databaseObjects] =
            "databaseObjectsSection";
          mSectionIds[Constants.section.businessLogic] = "businessLogicSection";
          mSectionIds[Constants.section.alvOutputs] = "alvOutputsSection";
          mSectionIds[Constants.section.evidences] = "evidencesSection";
          mSectionIds[Constants.section.recommendations] =
            "recommendationsSection";
          mSectionIds[Constants.section.messages] = "messagesSection";

          return Object.keys(mSectionIds).find(function (sKey) {
            return sSectionId && sSectionId.indexOf(mSectionIds[sKey]) !== -1;
          });
        },

        _setBusy: function (bBusy) {
          this._oViewModel.setProperty("/busy", bBusy);
        },



    onRequestHistoryScopeChange: function (oEvent) {
      this._oViewModel.setProperty("/requestHistory/scope", oEvent.getSource().getSelectedKey());
      this._updateRequestHistoryItems();
      this._scheduleRequestHistoryPoll();
    },

    onRefreshRequestHistory: function () {
      this._clearRequestHistoryTimer();
      return this._loadRequestHistory();
    },

    onRequestHistoryPress: function (oEvent) {
      var oContext = oEvent.getSource().getBindingContext("detail");
      var oRow = oContext && oContext.getObject();
      if (!oRow || !oRow.analysisId || !oRow.requestId) { return; }
      if (!RequestHistory.sameId(oRow.analysisId, this._oViewModel.getProperty("/analysisId"))) {
        this._oPendingHistoryRequest = oRow;
        this.getRouter().navTo("analysisDetail", { analysisId: oRow.analysisId });
        return;
      }
      this._openRequestHistoryDetail(oRow);
    },

    _onAnyRouteMatched: function (oEvent) {
      var sName = oEvent.getParameter("name");
      if (sName !== "analysisDetail" && sName !== "detail") {
        this._oPendingHistoryRequest = null;
        this._stopRequestHistory();
        this._stopLegacyComparison();
        this._bODataGenerationDialogOpen = false;
        this._cancelODataGenerationPolling();
        var oGenerationDialog = this.byId && this.byId("odataGenerationDialog");
        if (oGenerationDialog && oGenerationDialog.isOpen && oGenerationDialog.isOpen()) {
          oGenerationDialog.close();
        }
      }
    },

    _clearRequestHistoryTimer: function () {
      if (this._iRequestHistoryTimer) {
        clearTimeout(this._iRequestHistoryTimer);
        this._iRequestHistoryTimer = null;
      }
    },

    _stopRequestHistory: function () {
      this._bRequestHistoryActive = false;
      this._iRequestHistoryVersion = (this._iRequestHistoryVersion || 0) + 1;
      this._iRequestHistoryDetailVersion = (this._iRequestHistoryDetailVersion || 0) + 1;
      this._pRequestHistoryLoad = null;
      this._clearRequestHistoryTimer();
    },

    _updateRequestHistoryItems: function () {
      var oState = this._oViewModel.getProperty("/requestHistory");
      var aRows = RequestHistory.merge(this._aRequestHistoryServerRows || [],
        this._aRequestHistoryOptimisticRows || []);
      this._oViewModel.setProperty("/requestHistory/items", RequestHistory.visible(aRows,
        this._oViewModel.getProperty("/analysisId"), oState.scope));
    },

    _scheduleRequestHistoryPoll: function () {
      this._clearRequestHistoryTimer();
      if (!this._bRequestHistoryActive || this._pRequestHistoryLoad ||
          !(this._oViewModel.getProperty("/requestHistory/items") || []).some(function (oRow) {
            return RequestHistory.isActive(oRow.status);
          })) { return; }
      this._iRequestHistoryTimer = setTimeout(function () {
        this._iRequestHistoryTimer = null;
        this._loadRequestHistory();
      }.bind(this), REQUEST_POLL_INTERVAL_MS);
    },

    _loadRequestHistory: function () {
      if (!this._bRequestHistoryActive) { return Promise.resolve(); }
      if (this._pRequestHistoryLoad) { return this._pRequestHistoryLoad; }
      var iVersion = this._iRequestHistoryVersion;
      this._oViewModel.setProperty("/requestHistory/busy", true);
      this._oViewModel.setProperty("/requestHistory/error", "");
      this._pRequestHistoryLoad = Promise.resolve().then(function () {
        return this.getRequestHistoryService().readMyRequests();
      }.bind(this)).then(function (oResult) {
        if (!this._bRequestHistoryActive || iVersion !== this._iRequestHistoryVersion) { return; }
        var aServer = oResult.captures.map(function (oRow) {
          return RequestHistory.normalize(oRow, "CAPTURE");
        }).concat(oResult.generations.map(function (oRow) {
          return RequestHistory.normalize(oRow, "GENERATION");
        }));
        var mFound = {};
        aServer.forEach(function (oRow) { mFound[RequestHistory.key(oRow)] = true; });
        this._aRequestHistoryOptimisticRows = (this._aRequestHistoryOptimisticRows || []).filter(function (oRow) {
          return !mFound[RequestHistory.key(oRow)] && Date.now() - oRow._addedAt < 600000;
        });
        this._aRequestHistoryServerRows = aServer;
        this._updateRequestHistoryItems();
      }.bind(this)).catch(function (oError) {
        if (this._bRequestHistoryActive && iVersion === this._iRequestHistoryVersion) {
          var sMessage = this.parseError(oError).message;
          this._oViewModel.setProperty("/requestHistory/error", sMessage && sMessage !== "Unexpected error." ?
            sMessage : this.getText("requestHistoryLoadError"));
        }
      }.bind(this)).finally(function () {
        if (this._bRequestHistoryActive && iVersion === this._iRequestHistoryVersion) {
          this._pRequestHistoryLoad = null;
          this._oViewModel.setProperty("/requestHistory/busy", false);
          this._scheduleRequestHistoryPoll();
        }
      }.bind(this));
      return this._pRequestHistoryLoad;
    },

    _recordSubmittedRequest: function (sKind, sAnalysisId, sRequestId, oResponse) {
      if (!this._bRequestHistoryActive || !sRequestId ||
          !RequestHistory.sameId(sAnalysisId, this._oViewModel.getProperty("/analysisId"))) { return; }
      var oRow = RequestHistory.normalize({
        RequestId: sRequestId,
        AnalysisId: sAnalysisId,
        CreatedAt: new Date().toISOString(),
        Status: oResponse && oResponse.Status || "QUEUED",
        Message: oResponse && oResponse.Message || "",
        CountRow: oResponse && oResponse.CountRow
      }, sKind);
      oRow._addedAt = Date.now();
      this._aRequestHistoryOptimisticRows = (this._aRequestHistoryOptimisticRows || []).filter(function (oExisting) {
        return RequestHistory.key(oExisting) !== RequestHistory.key(oRow);
      });
      this._aRequestHistoryOptimisticRows.push(oRow);
      this._updateRequestHistoryItems();
      this._clearRequestHistoryTimer();
      this._loadRequestHistory();
    },

    _openRequestHistoryDetail: function (oRow) {
      var sAnalysisId = oRow.analysisId;
      var sRequestId = oRow.requestId;
      var iVersion = (this._iRequestHistoryDetailVersion || 0) + 1;
      this._iRequestHistoryDetailVersion = iVersion;
      this._iLegacyComparisonVersion = (this._iLegacyComparisonVersion || 0) + 1;
      if (oRow.kind === "CAPTURE") {
        this._stopLegacyComparison();
        this._aLegacyCapturedRows = null;
        this._sLegacySelectionJson = "";
        this._oViewModel.setProperty("/comparison/historyMode", true);
        this._oViewModel.setProperty("/comparison/requestId", sRequestId);
        this._oViewModel.setProperty("/comparison/captureStatus", oRow.status);
        this._oViewModel.setProperty("/comparison/captureMessage",
          RequestHistory.isActive(oRow.status) ? "" : oRow.message);
        this._oViewModel.setProperty("/comparison/captureCount", oRow.rowCount);
        this._oViewModel.setProperty("/comparison/ready", false);
        this._oViewModel.setProperty("/comparison/error", "");
        this._oViewModel.setProperty("/comparison/reason",
          RequestHistory.isActive(oRow.status) ? "" : oRow.message || "");
        this.onOpenLegacyComparison();
        this.onCheckLegacyCapture();
        return;
      }
      this._cancelODataGenerationPolling();
      this._oViewModel.setProperty("/odataGeneration/requestId", sRequestId);
      this._oViewModel.setProperty("/odataGeneration/status", oRow.status);
      this._oViewModel.setProperty("/odataGeneration/message", oRow.message);
      this._oViewModel.setProperty("/odataGeneration/result", {});
      this._oViewModel.setProperty("/odataGeneration/hasResult", true);
      this._oViewModel.setProperty("/odataGeneration/preflightReady", false);
      this._oViewModel.setProperty("/odataGeneration/canGenerate", false);
      this._oViewModel.setProperty("/odataGeneration/error", "");
      this._openODataGenerationDialog(sAnalysisId);
      this._setODataGenerationBusy(true);
      this.getAnalysisService().getODataGeneration(sAnalysisId, sRequestId).then(function (oResponse) {
        if (iVersion !== this._iRequestHistoryDetailVersion || !this._bRequestHistoryActive ||
            !RequestHistory.sameId(sAnalysisId, this._oViewModel.getProperty("/analysisId"))) { return; }
        if (oResponse && ((oResponse.RequestId && !RequestHistory.sameId(oResponse.RequestId, sRequestId)) ||
            (oResponse.AnalysisId && !RequestHistory.sameId(oResponse.AnalysisId, sAnalysisId)))) {
          throw new Error("Generation response does not match AnalysisId and RequestId.");
        }
        var oParsed = this._applyODataGenerationResponse(oResponse);
        if (oParsed.status === "FAILED" || oParsed.status === "DISPATCH_FAILED" || oParsed.status === "BLOCKED") {
          this._oViewModel.setProperty("/odataGeneration/error", oParsed.message || this.getText("odataGenerationFailed"));
        }
      }.bind(this)).catch(function (oError) {
        if (iVersion === this._iRequestHistoryDetailVersion && this._bRequestHistoryActive) {
          this._showODataGenerationError(oError, "requestHistoryDetailError");
        }
      }.bind(this)).finally(function () {
        if (iVersion === this._iRequestHistoryDetailVersion && this._bRequestHistoryActive) {
          this._setODataGenerationBusy(false);
          this._resumeODataGenerationPolling();
        }
      }.bind(this));
    },

    onOpenFioriUiPrepareDialog: function () {
      var sAnalysisId = this._oViewModel.getProperty("/analysisId");
      if (!sAnalysisId) {
        return;
      }
      this._oViewModel.setProperty("/fioriUi/error", "");
      this._openFioriUiPrepareDialog(sAnalysisId);
    },

    onCloseFioriUiPrepareDialog: function () {
      if (this._oViewModel.getProperty("/fioriUi/busy")) {
        return;
      }
      this.byId("fioriUiPrepareDialog").close();
    },

    onFioriUiInputChange: function (oEvent) {
      var oBinding = oEvent.getSource().getBinding("value");
      var sPath = oBinding && oBinding.getPath();
      if (sPath !== "/fioriUi/serviceRootUrl") {
        return;
      }
      var sValue = oEvent.getParameter("value");
      this._closeFioriUiReport();
      this._oViewModel.setProperty(sPath, sValue);
      this._iFioriUiRequestVersion = (this._iFioriUiRequestVersion || 0) + 1;
      this._oViewModel.setProperty("/fioriUi", Object.assign({}, this._oViewModel.getProperty("/fioriUi"), {
        busy: false, error: "", hasResult: false, status: "", runtimeCheck: "", issueCount: 0,
        entitySet: "", issues: [], columns: [], filters: [], config: null,
        prepareAnalysisId: "", configAnalysisId: "",
        metadataStatus: "", metadataIssues: [], metadataSignature: "", reportError: ""
      }));
    },

    onPrepareFioriUi: function () {
      if (this._oViewModel.getProperty("/fioriUi/busy")) {
        return;
      }
      var sAnalysisId = this._oViewModel.getProperty("/analysisId");
      var sServiceRootUrl = String(this._oViewModel.getProperty("/fioriUi/serviceRootUrl") || "").trim();
      var iRequestVersion;

      if (!sAnalysisId || !sServiceRootUrl) {
        this._oViewModel.setProperty("/fioriUi/error", this.getText("fioriUiRequiredInputs"));
        return;
      }

      iRequestVersion = (this._iFioriUiRequestVersion || 0) + 1;
      this._closeFioriUiReport();
      this._iFioriUiRequestVersion = iRequestVersion;
      this._oViewModel.setProperty("/fioriUi/error", "");
      this._oViewModel.setProperty("/fioriUi/hasResult", false);
      this._oViewModel.setProperty("/fioriUi/metadataStatus", "");
      this._oViewModel.setProperty("/fioriUi/metadataIssues", []);
      this._oViewModel.setProperty("/fioriUi/metadataSignature", "");
      this._oViewModel.setProperty("/fioriUi/reportError", "");
      this._oViewModel.setProperty("/fioriUi/config", null);
      this._oViewModel.setProperty("/fioriUi/prepareAnalysisId", "");
      this._oViewModel.setProperty("/fioriUi/configAnalysisId", "");
      this._oViewModel.setProperty("/fioriUi/busy", true);
      this.getAnalysisService().prepareFioriUi(sAnalysisId, {
        targetPackage: FIORI_UI_TARGET_PACKAGE,
        serviceRootUrl: sServiceRootUrl
      }).then(function (oResponse) {
        var oResult = FioriUiConfig.parse(oResponse);
        if (iRequestVersion === this._iFioriUiRequestVersion && sAnalysisId === this._oViewModel.getProperty("/analysisId")) {
          this._oViewModel.setProperty("/fioriUi", Object.assign({}, this._oViewModel.getProperty("/fioriUi"), oResult, {
            busy: false,
            error: "",
            hasResult: true
          }));
        }
      }.bind(this)).catch(function (oError) {
        if (iRequestVersion === this._iFioriUiRequestVersion && sAnalysisId === this._oViewModel.getProperty("/analysisId")) {
          var sMessage = oError && oError.message === "Invalid ConfigJson." ?
            this.getText("fioriUiInvalidConfigJson") : this.parseError(oError).message;
          this._oViewModel.setProperty("/fioriUi/error", sMessage && sMessage !== "Unexpected error." ?
            sMessage : this.getText("fioriUiPrepareError"));
        }
      }.bind(this)).finally(function () {
        if (iRequestVersion === this._iFioriUiRequestVersion && sAnalysisId === this._oViewModel.getProperty("/analysisId")) {
          this._oViewModel.setProperty("/fioriUi/busy", false);
        }
      }.bind(this));
    },

    onValidateFioriUiMetadata: function () {
      var oState = this._oViewModel.getProperty("/fioriUi");
      var sAnalysisId = this._oViewModel.getProperty("/analysisId");
      if (oState.busy || !oState.hasResult || oState.status !== "CONFIG_READY" || !oState.config) {
        return;
      }
      var iRequestVersion = (this._iFioriUiRequestVersion || 0) + 1;
      this._closeFioriUiReport();
      this._iFioriUiRequestVersion = iRequestVersion;
      this._oViewModel.setProperty("/fioriUi/busy", true);
      this._oViewModel.setProperty("/fioriUi/metadataStatus", "");
      this._oViewModel.setProperty("/fioriUi/metadataIssues", []);
      this._oViewModel.setProperty("/fioriUi/metadataSignature", "");
      this._oViewModel.setProperty("/fioriUi/reportError", "");
      var sSignature = this._fioriUiSignature();
      Promise.resolve().then(function () {
        FioriUiReportConfig.assertService(oState.config, oState.serviceRootUrl);
        return FioriUiMetadata.check(oState.config);
      }).then(function (oResult) {
        if (iRequestVersion === this._iFioriUiRequestVersion && sAnalysisId === this._oViewModel.getProperty("/analysisId")) {
          this._oViewModel.setProperty("/fioriUi/metadataStatus", oResult.status);
          this._oViewModel.setProperty("/fioriUi/metadataSignature", oResult.status === "VALIDATED" ? sSignature : "");
          this._oViewModel.setProperty("/fioriUi/metadataIssues", oResult.issues.map(function (sIssue) {
            return { message: sIssue };
          }));
        }
      }.bind(this)).catch(function (oError) {
        if (iRequestVersion === this._iFioriUiRequestVersion && sAnalysisId === this._oViewModel.getProperty("/analysisId")) {
          this._oViewModel.setProperty("/fioriUi/metadataStatus", "INVALID");
          this._oViewModel.setProperty("/fioriUi/metadataIssues", [
            { message: oError.message || this.getText("fioriUiMetadataError") }
          ]);
        }
      }.bind(this)).finally(function () {
        if (iRequestVersion === this._iFioriUiRequestVersion && sAnalysisId === this._oViewModel.getProperty("/analysisId")) {
          this._oViewModel.setProperty("/fioriUi/busy", false);
        }
      }.bind(this));
    },

    _fioriUiSignature: function () {
      return JSON.stringify({
        routeAnalysisId: this._sCurrentRouteAnalysisId || "",
        analysisId: this._oViewModel.getProperty("/analysisId"),
        prepareAnalysisId: this._oViewModel.getProperty("/fioriUi/prepareAnalysisId"),
        configAnalysisId: this._oViewModel.getProperty("/fioriUi/configAnalysisId"),
        serviceRootUrl: this._oViewModel.getProperty("/fioriUi/serviceRootUrl"),
        config: this._oViewModel.getProperty("/fioriUi/config")
      });
    },

    onOpenFioriUiReport: function () {
      var oState = this._oViewModel.getProperty("/fioriUi");
      var sSignature = this._fioriUiSignature();
      this._closeFioriUiReport();
      this._oViewModel.setProperty("/fioriUi/reportError", "");
      try {
        var sServiceUrl = FioriUiReportConfig.assertCurrent(oState,
          this._oViewModel.getProperty("/analysisId"), this._sCurrentRouteAnalysisId, sSignature);
        this._oFioriUiReport = FioriUiReport.open(this, sServiceUrl, oState.config, function () {
          try {
            FioriUiReportConfig.assertCurrent(this._oViewModel.getProperty("/fioriUi"),
              this._oViewModel.getProperty("/analysisId"), this._sCurrentRouteAnalysisId,
              this._fioriUiSignature());
            return sSignature === this._fioriUiSignature();
          } catch (oError) {
            return false;
          }
        }.bind(this));
      } catch (oError) {
        this._oViewModel.setProperty("/fioriUi/reportError", oError.message);
      }
    },

    _closeFioriUiReport: function () {
      if (this._oFioriUiReport) {
        this._oFioriUiReport.close();
        this._oFioriUiReport = null;
      }
    },

    onOpenODataGenerationDialog: function () {
      var sAnalysisId = this._oViewModel.getProperty("/analysisId");
      var sStatus = this._oViewModel.getProperty("/odataGeneration/status");

      if (!sAnalysisId) {
        this._oViewModel.setProperty("/odataGeneration/error", this.getText("odataGenerationAnalysisIdRequired"));
        return;
      }
      if (sStatus !== "BLOCKED" && sStatus !== "FAILED" && sStatus !== "DISPATCH_FAILED") {
        this._oViewModel.setProperty("/odataGeneration/error", "");
      }
      this._openODataGenerationDialog(sAnalysisId);
    },

    onCloseODataGenerationDialog: function () {
      this._iRequestHistoryDetailVersion = (this._iRequestHistoryDetailVersion || 0) + 1;
      this._bODataGenerationDialogOpen = false;
      this._cancelODataGenerationPolling();
      var oDialog = this.byId("odataGenerationDialog");
      if (oDialog) {
        oDialog.close();
      }
    },

    onAfterCloseODataGenerationDialog: function () {
      this._iRequestHistoryDetailVersion = (this._iRequestHistoryDetailVersion || 0) + 1;
      this._bODataGenerationDialogOpen = false;
      this._cancelODataGenerationPolling();
    },

    onODataGenerationInputChange: function (oEvent) {
      if (ODataGeneration.isGenerationActive(this._oViewModel.getProperty("/odataGeneration/status")) ||
          this._oViewModel.getProperty("/odataGeneration/dialogBusy")) {
        return;
      }
      var oSource = oEvent.getSource();
      var oBinding = oSource.getBinding("value") || oSource.getBinding("selectedKey");
      var sPath = oBinding && oBinding.getPath();
      var sValue = oSource.getValue ? oSource.getValue() : oSource.getSelectedKey();

      if (sPath) {
        this._oViewModel.setProperty(sPath, ODataGeneration.normalizeUpper(sValue));
      }
      this._invalidateODataGenerationPreflight();
    },

    onPreflightOData: function () {
      var oState;
      var oParameters;
      var sValidationError;
      var iRequestVersion;
      var sAnalysisId = this._oViewModel.getProperty("/analysisId");

      if (this._oViewModel.getProperty("/odataGeneration/dialogBusy") ||
          ODataGeneration.isGenerationActive(this._oViewModel.getProperty("/odataGeneration/status"))) {
        return;
      }
      oState = this._oViewModel.getProperty("/odataGeneration");
      sValidationError = this._validateODataGeneration(oState, false);
      if (!sAnalysisId || sValidationError) {
        this._oViewModel.setProperty("/odataGeneration/error", !sAnalysisId ?
          this.getText("odataGenerationAnalysisIdRequired") : sValidationError);
        return;
      }

      oParameters = ODataGeneration.normalizeParameters(oState, ODataGeneration.ZERO_UUID);
      if (oState.status === "GENERATED" || oState.status === "FAILED" || oState.status === "BLOCKED") {
        this._oViewModel.setProperty("/odataGeneration/requestId", "");
        this._oViewModel.setProperty("/odataGeneration/generationSignature", "");
      }
      this._oViewModel.setProperty("/odataGeneration/preflightReady", false);
      this._oViewModel.setProperty("/odataGeneration/preflightSignature", "");
      this._oViewModel.setProperty("/odataGeneration/canGenerate", false);
      iRequestVersion = (this._iODataGenerationRequestVersion || 0) + 1;
      this._iODataGenerationRequestVersion = iRequestVersion;
      this._setODataGenerationInputs(oParameters);
      this._setODataGenerationBusy(true);
      this.getAnalysisService().preflightOData(sAnalysisId, oParameters).then(function (oResponse) {
        if (iRequestVersion !== this._iODataGenerationRequestVersion ||
            sAnalysisId !== this._oViewModel.getProperty("/analysisId")) {
          return;
        }
        var oParsed = this._applyODataGenerationResponse(oResponse);
        var bReady = oParsed.status === "READY";
        this._oViewModel.setProperty("/odataGeneration/preflightReady", bReady);
        this._oViewModel.setProperty("/odataGeneration/preflightSignature", bReady ? ODataGeneration.signature(oState) : "");
        this._oViewModel.setProperty("/odataGeneration/canGenerate", bReady);
        if (oParsed.status === "BLOCKED") {
          this._oViewModel.setProperty("/odataGeneration/error", oParsed.message || this.getText("odataGenerationBlocked"));
        }
      }.bind(this)).catch(function (oError) {
        if (iRequestVersion === this._iODataGenerationRequestVersion) {
          this._invalidateODataGenerationPreflight(false);
          this._showODataGenerationError(oError, "odataGenerationPreflightError");
        }
      }.bind(this)).finally(function () {
        if (iRequestVersion === this._iODataGenerationRequestVersion) {
          this._setODataGenerationBusy(false);
        }
      }.bind(this));
    },

    onGenerateOData: function () {
      var oState;
      var oParameters;
      var sSignature;
      var sRequestId;
      var sValidationError;
      var iRequestVersion;
      var sAnalysisId = this._oViewModel.getProperty("/analysisId");

      if (this._oViewModel.getProperty("/odataGeneration/dialogBusy") ||
          ODataGeneration.isGenerationActive(this._oViewModel.getProperty("/odataGeneration/status"))) {
        return;
      }
      oState = this._oViewModel.getProperty("/odataGeneration");
      sValidationError = this._validateODataGeneration(oState, true);
      sSignature = ODataGeneration.signature(oState);
      if (!sAnalysisId || sValidationError || !oState.preflightReady || oState.preflightSignature !== sSignature) {
        this._oViewModel.setProperty("/odataGeneration/error", !sAnalysisId ?
          this.getText("odataGenerationAnalysisIdRequired") : sValidationError || this.getText("odataGenerationPreflightRequired"));
        return;
      }

      sRequestId = ODataGeneration.createUuid();
      oParameters = ODataGeneration.normalizeParameters(oState, sRequestId);
      iRequestVersion = (this._iODataGenerationRequestVersion || 0) + 1;
      this._iODataGenerationRequestVersion = iRequestVersion;
      this._setODataGenerationInputs(oParameters);
      this._oViewModel.setProperty("/odataGeneration/requestId", sRequestId);
      this._oViewModel.setProperty("/odataGeneration/generationSignature", sSignature);
      this._oViewModel.setProperty("/odataGeneration/canGenerate", false);
      this._oViewModel.setProperty("/odataGeneration/preflightReady", false);
      this._setODataGenerationBusy(true);
      this.getAnalysisService().generateOData(sAnalysisId, oParameters).then(function (oResponse) {
        if (iRequestVersion === this._iODataGenerationRequestVersion &&
            sAnalysisId === this._oViewModel.getProperty("/analysisId")) {
          this._handleODataGenerationStatus(this._applyODataGenerationResponse(oResponse), true);
          this._recordSubmittedRequest("GENERATION", sAnalysisId, sRequestId, oResponse);
        }
      }.bind(this)).catch(function (oError) {
        if (iRequestVersion === this._iODataGenerationRequestVersion) {
          this._showODataGenerationError(oError, "odataGenerationGenerateError");
        }
      }.bind(this)).finally(function () {
        if (iRequestVersion === this._iODataGenerationRequestVersion) {
          this._setODataGenerationBusy(false);
        }
      }.bind(this));
    },

    onRefreshODataGeneration: function () {
      this._clearODataGenerationTimer();
      this._oViewModel.setProperty("/odataGeneration/polling", false);
      this._pollODataGeneration(true);
    },

    onOpenLegacyComparison: function () {
      var oState = this._oViewModel.getProperty("/comparison");
      var oPrepared = this._oViewModel.getProperty("/fioriUi") || {};
      var oGenerated = this._oViewModel.getProperty("/odataGeneration/result") || {};
      var sGeneratedRoot = oGenerated.serviceUrl || "";
      var oManifest = this.getOwnerComponent && this.getOwnerComponent().getManifest();
      var sMainRoot = oManifest && oManifest["sap.app"] &&
        oManifest["sap.app"].dataSources && oManifest["sap.app"].dataSources.mainService.uri || "";
      var aClient = /[?&]sap-client=([0-9]{1,3})/.exec(sMainRoot);
      if (sGeneratedRoot && aClient && !/[?&]sap-client=/.test(sGeneratedRoot)) {
        sGeneratedRoot += (sGeneratedRoot.indexOf("?") < 0 ? "?" : "&") + "sap-client=" + aClient[1];
      }
      if (!oState.serviceRootUrl) {
        this._oViewModel.setProperty("/comparison/serviceRootUrl",
          oPrepared.metadataStatus === "VALIDATED" && oPrepared.serviceRootUrl || sGeneratedRoot);
      }
      if (!oState.entitySet) {
        this._oViewModel.setProperty("/comparison/entitySet",
          oPrepared.metadataStatus === "VALIDATED" && oPrepared.entitySet || oGenerated.entityName || "");
      }
      if (!this._pLegacyComparisonDialog) {
        this._pLegacyComparisonDialog = Fragment.load({
          id: this.getView().getId(),
          name: "abap.to.fiori.system.view.fragments.LegacyComparisonDialog",
          controller: this
        }).then(function (oDialog) {
          this.getView().addDependent(oDialog);
          return oDialog;
        }.bind(this));
      }
      var sAnalysisId = this._oViewModel.getProperty("/analysisId");
      this._pLegacyComparisonDialog.then(function (oDialog) {
        if (sAnalysisId === this._oViewModel.getProperty("/analysisId")) {
          oDialog.open();
          this._bLegacyComparisonOpen = true;
          var oCurrent = this._oViewModel.getProperty("/comparison");
          if (!oCurrent.historyMode && oCurrent.requestId && this._sLegacySelectionJson === "[]" &&
              RequestHistory.isActive(oCurrent.captureStatus)) {
            this._bLegacyAutoCompare = true;
          }
          this._scheduleLegacyComparisonPoll();
        }
      }.bind(this)).catch(function (oError) {
        this._pLegacyComparisonDialog = null;
        this._oViewModel.setProperty("/comparison/reason", oError.message);
      }.bind(this));
    },

    onCloseLegacyComparison: function () {
      this._stopLegacyComparison();
      this._oViewModel.setProperty("/comparison/busy", false);
      this.byId("legacyComparisonDialog").close();
    },

    _clearLegacyComparisonTimer: function () {
      if (this._iLegacyComparisonTimer) {
        clearTimeout(this._iLegacyComparisonTimer);
        this._iLegacyComparisonTimer = null;
      }
    },

    _stopLegacyComparison: function () {
      this._clearLegacyComparisonTimer();
      this._bLegacyAutoCompare = false;
      this._bLegacyComparisonOpen = false;
      this._iLegacyComparisonVersion = (this._iLegacyComparisonVersion || 0) + 1;
    },

    _scheduleLegacyComparisonPoll: function () {
      this._clearLegacyComparisonTimer();
      var oState = this._oViewModel.getProperty("/comparison");
      if (!this._bLegacyComparisonOpen || !this._bLegacyAutoCompare || oState.busy ||
          !oState.requestId || !RequestHistory.isActive(oState.captureStatus)) { return; }
      this._iLegacyComparisonTimer = setTimeout(function () {
        this._iLegacyComparisonTimer = null;
        this.onCheckLegacyCapture();
      }.bind(this), REQUEST_POLL_INTERVAL_MS);
    },

    _clearLegacyMappingLog: function () {
      this._oViewModel.setProperty("/comparison/mappingLog", []);
      this._oViewModel.setProperty("/comparison/mappingLogReady", false);
    },

    _resetLegacyRunLog: function () {
      this._oViewModel.setProperty("/comparison/runLog", []);
      this._oViewModel.setProperty("/comparison/runLogText", "");
    },

    _appendLegacyRunLog: function (sLevel, sStep, sMessage) {
      var aLog = this._oViewModel.getProperty("/comparison/runLog") || [];
      var oEntry = { timestamp: new Date().toISOString(), level: sLevel, step: sStep,
        message: String(sMessage).replace(/[\r\n]+/g, " ") };
      aLog.push(oEntry);
      this._oViewModel.setProperty("/comparison/runLog", aLog);
      var sPrevious = this._oViewModel.getProperty("/comparison/runLogText") || "";
      this._oViewModel.setProperty("/comparison/runLogText", (sPrevious ? sPrevious + "\n" : "") +
        "[" + oEntry.timestamp + "] [" + oEntry.level + "] [" + oEntry.step + "] " + oEntry.message);
    },

    onLegacyComparisonInputChange: function (oEvent) {
      var oState = this._oViewModel.getProperty("/comparison");
      var bReuseCapture = oState.captureStatus === "CAPTURED" && !!oState.requestId;
      var oBinding = oEvent.getSource().getBinding("value");
      var sPath = oBinding && oBinding.getPath();
      if (sPath) { this._oViewModel.setProperty(sPath, oEvent.getParameter("value")); }
      this._oViewModel.setProperty("/comparison/manualColumnMappingJson", "{}");
      this._iLegacyComparisonVersion = (this._iLegacyComparisonVersion || 0) + 1;
      this._clearLegacyComparisonTimer();
      this._bLegacyAutoCompare = false;
      this._oViewModel.setProperty("/comparison/busy", false);
      this._resetLegacyRunLog();
      if (!bReuseCapture) {
        this._aLegacyCapturedRows = null;
        this._oViewModel.setProperty("/comparison/requestId", "");
        this._oViewModel.setProperty("/comparison/captureStatus", "");
        this._oViewModel.setProperty("/comparison/captureMessage", "");
        this._oViewModel.setProperty("/comparison/captureCount", null);
      }
      this._oViewModel.setProperty("/comparison/ready", bReuseCapture && !!this._aLegacyCapturedRows);
      this._oViewModel.setProperty("/comparison/status", "INCONCLUSIVE");
      this._oViewModel.setProperty("/comparison/error", "");
      this._oViewModel.setProperty("/comparison/reason", this.getText("legacyCompareInputsChanged"));
      this._oViewModel.setProperty("/comparison/differences", []);
      this._clearLegacyMappingLog();
      this._oViewModel.setProperty("/comparison/odataCount", null);
      this._oViewModel.setProperty("/comparison/comparedColumnCount", null);
      this._oViewModel.setProperty("/comparison/scopeMessage", "");
      this._appendLegacyRunLog("WARN", "INPUT", "Comparison input changed: " + (sPath || "unknown") +
        ". Previous result invalidated; " + (bReuseCapture ?
          "captured RequestId=" + oState.requestId + " retained." : "a new capture is required."));
    },

    onLegacyComparisonMappingChange: function (oEvent) {
      this._oViewModel.setProperty("/comparison/manualColumnMappingJson", oEvent.getParameter("value"));
      this._iLegacyComparisonVersion = (this._iLegacyComparisonVersion || 0) + 1;
      this._oViewModel.setProperty("/comparison/status", "INCONCLUSIVE");
      this._oViewModel.setProperty("/comparison/error", "");
      this._oViewModel.setProperty("/comparison/reason", this.getText("legacyCompareInputsChanged"));
      this._oViewModel.setProperty("/comparison/differences", []);
      this._oViewModel.setProperty("/comparison/odataCount", null);
      this._oViewModel.setProperty("/comparison/comparedColumnCount", null);
      this._oViewModel.setProperty("/comparison/scopeMessage", "");
      this._clearLegacyMappingLog();
      this._appendLegacyRunLog("INFO", "MAPPING", "Manual column mapping changed; retry comparison with the current capture.");
    },

    onRequestLegacyCapture: function () {
      var oState = this._oViewModel.getProperty("/comparison");
      if (oState.busy) { return; }
      if (oState.captureStatus === "CAPTURED" && oState.requestId) {
        return oState.ready && this._aLegacyCapturedRows ?
          this.onCompareLegacyRows() : this.onCheckLegacyCapture();
      }
      return this.onStartNewLegacyCapture();
    },

    onStartNewLegacyCapture: function () {
      var oState = this._oViewModel.getProperty("/comparison");
      var sAnalysisId = this._oViewModel.getProperty("/analysisId");
      if (oState.busy || RequestHistory.isActive(oState.captureStatus)) { return; }
      if (!oState.serviceRootUrl || !oState.entitySet) {
        this._resetLegacyRunLog();
        this._legacyInconclusive(new Error(this.getText("legacyCompareTargetRequired")), "CAPTURE");
        return;
      }
      try {
        FioriUiReportConfig.serviceUrl(oState.serviceRootUrl);
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(oState.entitySet)) {
          throw new Error("Invalid generated OData entity set name.");
        }
      } catch (oError) {
        this._resetLegacyRunLog();
        this._legacyInconclusive(oError, "CAPTURE");
        return;
      }
      var sSelectionJson = "[]";
      var sRequestId = ODataGeneration.createUuid();
      var bSubmitted = false;
      var iVersion = (this._iLegacyComparisonVersion || 0) + 1;
      this._iLegacyComparisonVersion = iVersion;
      this._clearLegacyComparisonTimer();
      this._bLegacyAutoCompare = true;
      this._oViewModel.setProperty("/comparison/historyMode", false);
      this._oViewModel.setProperty("/comparison/selectionJson", sSelectionJson);
      this._aLegacyCapturedRows = null;
      this._sLegacySelectionJson = sSelectionJson;
      this._oViewModel.setProperty("/comparison/requestId", sRequestId);
      this._oViewModel.setProperty("/comparison/captureStatus", "");
      this._oViewModel.setProperty("/comparison/captureMessage", "");
      this._oViewModel.setProperty("/comparison/captureCount", null);
      this._oViewModel.setProperty("/comparison/odataCount", null);
      this._oViewModel.setProperty("/comparison/comparedColumnCount", null);
      this._oViewModel.setProperty("/comparison/scopeMessage", "");
      this._oViewModel.setProperty("/comparison/differences", []);
      this._clearLegacyMappingLog();
      this._oViewModel.setProperty("/comparison/ready", false);
      this._oViewModel.setProperty("/comparison/busy", true);
      this._oViewModel.setProperty("/comparison/status", "INCONCLUSIVE");
      this._oViewModel.setProperty("/comparison/error", "");
      this._oViewModel.setProperty("/comparison/reason", this.getText("legacyCompareSubmitting"));
      this._resetLegacyRunLog();
      this._appendLegacyRunLog("INFO", "CAPTURE", "Submitting AnalysisId=" + sAnalysisId +
        " RequestId=" + sRequestId + " SelectionJson=" + sSelectionJson + ".");
      return Promise.resolve().then(function () {
        return this._oLegacyComparisonService.captureLegacyRows(sAnalysisId, sRequestId, sSelectionJson);
      }.bind(this)).then(function (oResponse) {
        if (iVersion !== this._iLegacyComparisonVersion || sAnalysisId !== this._oViewModel.getProperty("/analysisId")) { return; }
        if (oResponse && oResponse.RequestId &&
            String(oResponse.RequestId).toLowerCase() !== sRequestId.toLowerCase()) {
          throw new Error("CaptureLegacyRows returned a different RequestId.");
        }
        bSubmitted = true;
        this._recordSubmittedRequest("CAPTURE", sAnalysisId, sRequestId, oResponse);
        return oResponse && oResponse.Status ? oResponse :
          this._oLegacyComparisonService.getLegacyCapture(sAnalysisId, sRequestId);
      }.bind(this)).then(function (oResponse) {
        if (iVersion !== this._iLegacyComparisonVersion || sAnalysisId !== this._oViewModel.getProperty("/analysisId")) { return; }
        if (!oResponse || !oResponse.Status) {
          throw new Error("Capture request was sent, but SAP did not return its Status.");
        }
        this._oViewModel.setProperty("/comparison/captureStatus", oResponse.Status);
        this._oViewModel.setProperty("/comparison/captureMessage",
          RequestHistory.isActive(oResponse.Status) ? "" : oResponse.Message || "");
        this._oViewModel.setProperty("/comparison/reason", oResponse.Status === "CAPTURED" ?
          this.getText("legacyCompareReady") : RequestHistory.isActive(oResponse.Status) ?
            "" : oResponse.Message || oResponse.Status);
        this._appendLegacyRunLog("INFO", "CAPTURE", "RequestId=" + sRequestId + " Status=" + oResponse.Status + ".");
        if (RequestHistory.isActive(oResponse.Status)) {
          this._appendLegacyRunLog("INFO", "WORKER", "Capture is pending; the scheduled SAP background job runs about every 2 minutes and status refreshes automatically.");
        }
      }.bind(this)).catch(function (oError) {
        if (iVersion === this._iLegacyComparisonVersion) {
          this._legacyInconclusive(oError, "CAPTURE");
          if (!bSubmitted) {
            this._oViewModel.setProperty("/comparison/requestId", "");
          } else if (!this._oViewModel.getProperty("/comparison/captureStatus")) {
            this._oViewModel.setProperty("/comparison/captureStatus", "UNKNOWN");
          }
        }
      }.bind(this)).finally(function () {
        if (iVersion === this._iLegacyComparisonVersion) {
          this._oViewModel.setProperty("/comparison/busy", false);
          if (bSubmitted && this._oViewModel.getProperty("/comparison/captureStatus") === "CAPTURED") {
            return this.onCheckLegacyCapture();
          }
          this._scheduleLegacyComparisonPoll();
        }
      }.bind(this));
    },

    onCheckLegacyCapture: function () {
      var oState = this._oViewModel.getProperty("/comparison");
      var sAnalysisId = this._oViewModel.getProperty("/analysisId");
      var sRequestId = oState.requestId;
      if (oState.busy || !sRequestId) { return; }
      this._clearLegacyComparisonTimer();
      var iVersion = (this._iLegacyComparisonVersion || 0) + 1;
      this._iLegacyComparisonVersion = iVersion;
      this._aLegacyCapturedRows = null;
      this._oViewModel.setProperty("/comparison/ready", false);
      this._oViewModel.setProperty("/comparison/captureCount", null);
      this._oViewModel.setProperty("/comparison/odataCount", null);
      this._oViewModel.setProperty("/comparison/comparedColumnCount", null);
      this._oViewModel.setProperty("/comparison/scopeMessage", "");
      this._oViewModel.setProperty("/comparison/busy", true);
      this._oViewModel.setProperty("/comparison/status", "INCONCLUSIVE");
      this._oViewModel.setProperty("/comparison/error", "");
      this._oViewModel.setProperty("/comparison/differences", []);
      this._clearLegacyMappingLog();
      this._appendLegacyRunLog("INFO", "CAPTURE_CHECK", "Reading AnalysisId=" + sAnalysisId +
        " RequestId=" + sRequestId + ".");
      var bCaptured = false;
      return Promise.resolve().then(function () {
        return this._oLegacyComparisonService.getLegacyCapture(sAnalysisId, sRequestId);
      }.bind(this)).then(function (oResponse) {
        if (iVersion !== this._iLegacyComparisonVersion || sAnalysisId !== this._oViewModel.getProperty("/analysisId")) { return; }
        this._oViewModel.setProperty("/comparison/captureStatus", oResponse && oResponse.Status || "");
        this._oViewModel.setProperty("/comparison/captureMessage",
          RequestHistory.isActive(oResponse && oResponse.Status) ? "" : oResponse && oResponse.Message || "");
        this._appendLegacyRunLog("INFO", "CAPTURE_CHECK", "Status=" + (oResponse && oResponse.Status || "unknown") + ".");
        if (RequestHistory.isActive(oResponse && oResponse.Status)) {
          if (!RequestHistory.sameId(oResponse.AnalysisId, sAnalysisId) ||
              !RequestHistory.sameId(oResponse.RequestId, sRequestId)) {
            throw new Error("Capture response does not match AnalysisId and RequestId.");
          }
          this._oViewModel.setProperty("/comparison/reason", "");
          return;
        }
        var oCapture = LegacyComparison.capture(oResponse, sAnalysisId, sRequestId);
        bCaptured = true;
        this._aLegacyCapturedRows = oCapture.rows;
        this._oViewModel.setProperty("/comparison/captureCount", oCapture.count);
        this._oViewModel.setProperty("/comparison/ready", true);
        this._oViewModel.setProperty("/comparison/reason",
          this.getText("legacyCompareReady"));
        this._appendLegacyRunLog("INFO", "CAPTURE_CHECK", "CAPTURED CountRow=" + oCapture.count +
          "; RowsJson contains " + oCapture.rows.length + " rows.");
      }.bind(this)).catch(function (oError) {
        if (iVersion === this._iLegacyComparisonVersion) { this._legacyInconclusive(oError, "CAPTURE_CHECK"); }
      }.bind(this)).finally(function () {
        if (iVersion === this._iLegacyComparisonVersion) {
          this._oViewModel.setProperty("/comparison/busy", false);
          if (bCaptured && this._bLegacyAutoCompare && !oState.historyMode) {
            this._bLegacyAutoCompare = false;
            return this.onCompareLegacyRows();
          }
          this._scheduleLegacyComparisonPoll();
        }
      }.bind(this));
    },

    _legacyAutomaticColumns: function (oState) {
      var oPrepared = this._oViewModel.getProperty("/fioriUi") || {};
      var oColumns = {};
      if (oPrepared.metadataStatus !== "VALIDATED" || !oPrepared.config ||
          oPrepared.serviceRootUrl !== oState.serviceRootUrl || oPrepared.entitySet !== oState.entitySet) {
        return oColumns;
      }
      (oPrepared.config.columns || oPrepared.config.Columns || []).forEach(function (oColumn) {
        var sAlv = oColumn && (oColumn.alvField || oColumn.AlvField ||
          oColumn.sourceField || oColumn.SourceField || oColumn.sourceColumn || oColumn.SourceColumn);
        var sTarget = oColumn && (oColumn.property || oColumn.Property ||
          oColumn.propertyName || oColumn.PropertyName);
        if (sAlv && sTarget) { oColumns[sAlv] = sTarget; }
      });
      return oColumns;
    },

    onCompareLegacyRows: function () {
      var oState = this._oViewModel.getProperty("/comparison");
      var sAnalysisId = this._oViewModel.getProperty("/analysisId");
      if (oState.busy || !oState.ready || !this._aLegacyCapturedRows) { return; }
      var oParameters = {}, oFilters = {}, oColumns, aKeys, oProjection;
      var bEmptyCapture = this._aLegacyCapturedRows.length === 0;
      var iVersion = (this._iLegacyComparisonVersion || 0) + 1;
      this._iLegacyComparisonVersion = iVersion;
      this._oViewModel.setProperty("/comparison/busy", true);
      this._oViewModel.setProperty("/comparison/status", "INCONCLUSIVE");
      this._oViewModel.setProperty("/comparison/error", "");
      this._oViewModel.setProperty("/comparison/reason", this.getText("legacyCompareLoading"));
      this._oViewModel.setProperty("/comparison/differences", []);
      this._clearLegacyMappingLog();
      this._oViewModel.setProperty("/comparison/odataCount", null);
      this._oViewModel.setProperty("/comparison/comparedColumnCount", null);
      this._oViewModel.setProperty("/comparison/scopeMessage", "");
      this._appendLegacyRunLog("INFO", "COMPARE", "Starting AnalysisId=" + sAnalysisId +
        " RequestId=" + oState.requestId + " CaptureStatus=" + oState.captureStatus +
        " CountRow=" + this._aLegacyCapturedRows.length + " EntitySet=" + oState.entitySet +
        " SelectionJson=" + (this._sLegacySelectionJson || "unknown") + ".");
      if (this._sLegacySelectionJson !== "[]") {
        this._appendLegacyRunLog("INFO", "SCOPE",
          "Comparing the saved ALV capture with all rows in the selected OData entity set. " +
          "Original SelectionJson=" + (this._sLegacySelectionJson || "unknown") + ".");
      }
      return Promise.resolve().then(function () {
        return this._oLegacyComparisonService.getEntityMetadata(oState.serviceRootUrl, oState.entitySet);
      }.bind(this)).then(function (oMetadata) {
        if (iVersion !== this._iLegacyComparisonVersion || sAnalysisId !== this._oViewModel.getProperty("/analysisId")) { return; }
        var oTypes = oMetadata.types;
        this._appendLegacyRunLog("INFO", "METADATA", "Resolved " + Object.keys(oTypes).length +
          " OData properties: " + Object.keys(oTypes).join(", ") + ".");
        if (bEmptyCapture) {
          var sProbe = oMetadata.keys[0] || Object.keys(oTypes)[0];
          if (!sProbe) { throw new Error("The OData entity has no property to read for an empty capture."); }
          oColumns = {};
          oColumns[sProbe] = sProbe;
          aKeys = [];
          this._appendLegacyRunLog("INFO", "MAPPING", "Empty ALV capture; checking every OData page for extra rows.");
        } else {
          var oManual = LegacyComparison.mapping(oState.manualColumnMappingJson || "{}",
            "ALV-to-OData mapping");
          var aCapturedFields = Array.from(new Set(this._aLegacyCapturedRows.reduce(function (aNames, oRow) {
            return aNames.concat(Object.keys(oRow));
          }, [])));
          Object.keys(oManual).forEach(function (sAlv) {
            if (aCapturedFields.indexOf(sAlv) < 0) {
              throw new Error("Manual mapping refers to ALV column " + sAlv +
                ", which is absent from this capture.");
            }
            if (!Object.prototype.hasOwnProperty.call(oTypes, oManual[sAlv])) {
              throw new Error("Manual mapping for " + sAlv + " refers to missing OData property " +
                oManual[sAlv] + ". Entity properties: " + Object.keys(oTypes).join(", ") + ".");
            }
          });
          oProjection = LegacyComparison.projectedColumns(this._aLegacyCapturedRows,
            Object.assign({}, this._legacyAutomaticColumns(oState), oManual), oTypes);
          oColumns = oProjection.columns;
          aKeys = LegacyComparison.metadataKeys(oColumns, oMetadata.keys);
          if (oProjection.omittedColumns.length || oProjection.unmatchedProperties.length) {
            var sScope = "Comparing " + Object.keys(oColumns).length +
              " generated OData properties across all captured rows.";
            if (oProjection.omittedColumns.length) {
              sScope += " Additional ALV fields outside this OData service are ignored: " +
                oProjection.omittedColumns.join(", ") + ".";
            }
            if (oProjection.unmatchedProperties.length) {
              sScope += " OData properties missing from the ALV capture: " +
                oProjection.unmatchedProperties.join(", ") + ".";
            }
            this._oViewModel.setProperty("/comparison/scopeMessage", sScope);
            this._appendLegacyRunLog("INFO", "SCOPE", sScope);
          }
        }
        this._oViewModel.setProperty("/comparison/columnMappingJson", JSON.stringify(oColumns, null, 2));
        this._oViewModel.setProperty("/comparison/keyColumnsJson", JSON.stringify(aKeys));
        var pRows = this._oLegacyComparisonService.readAllRows(oState.serviceRootUrl, oState.entitySet,
          oParameters, oFilters, oColumns, oTypes, function (oPage) {
            if (iVersion === this._iLegacyComparisonVersion && sAnalysisId === this._oViewModel.getProperty("/analysisId")) {
              this._appendLegacyRunLog("INFO", "ODATA_PAGE", "Page " + oPage.page + ": " + oPage.rows +
                " rows; total=" + oPage.totalRows + "; nextLink=" + (oPage.hasNext ? "yes" : "no") + ".");
            }
          }.bind(this));
        LegacyComparison.mappingLog(oColumns, aKeys, oFilters, oParameters).forEach(function (oMapping) {
          this._appendLegacyRunLog("INFO", "MAPPING", oMapping.kind === "NO_FILTER" ?
            "No OData filter (SelectionJson=[])." : oMapping.kind === "FILTER" ?
              "Filter " + oMapping.source + " -> " + oMapping.target + "." :
              "Column " + oMapping.source + " -> " + oMapping.target +
                (oMapping.isKey ? " (business key)." : "."));
        }.bind(this));
        if (!aKeys.length) {
          this._appendLegacyRunLog("INFO", "MAPPING", "No mapped entity keys; comparing complete rows with duplicate counts.");
        }
        return pRows.then(function (aOData) {
          if (iVersion !== this._iLegacyComparisonVersion || sAnalysisId !== this._oViewModel.getProperty("/analysisId")) { return; }
          this._oViewModel.setProperty("/comparison/mappingLog",
            LegacyComparison.mappingLog(oColumns, aKeys, oFilters, oParameters));
          this._oViewModel.setProperty("/comparison/mappingLogReady", true);
          this._appendLegacyRunLog("INFO", "COMPARE", "Comparing ALV rows=" + this._aLegacyCapturedRows.length +
            " with OData rows=" + aOData.length + " across " + Object.keys(oColumns).length + " columns.");
          if (bEmptyCapture) {
            return { status: aOData.length ? "FAIL" : "PASS", alvCount: 0, odataCount: aOData.length,
              differences: aOData.map(function (oRow, iIndex) {
                return { kind: "EXTRA", key: "#" + (iIndex + 1) + " (" + sProbe + "=" + String(oRow[sProbe]) + ")",
                  column: "", alv: "row missing", odata: "row present" };
              }) };
          }
          var oCompared = LegacyComparison.compare(this._aLegacyCapturedRows, aOData,
            oColumns, aKeys, oTypes);
          var aSchemaDifferences = LegacyComparison.schemaDifferences(oProjection);
          oCompared.differences = aSchemaDifferences.concat(oCompared.differences);
          if (aSchemaDifferences.length) { oCompared.status = "FAIL"; }
          return oCompared;
        }.bind(this));
      }.bind(this)).then(function (oResult) {
        if (iVersion !== this._iLegacyComparisonVersion || sAnalysisId !== this._oViewModel.getProperty("/analysisId")) { return; }
        this._oViewModel.setProperty("/comparison/status", oResult.status);
        this._oViewModel.setProperty("/comparison/error", "");
        this._oViewModel.setProperty("/comparison/reason", "");
        this._oViewModel.setProperty("/comparison/captureCount", oResult.alvCount);
        this._oViewModel.setProperty("/comparison/odataCount", oResult.odataCount);
        this._oViewModel.setProperty("/comparison/comparedColumnCount", bEmptyCapture ? 0 : Object.keys(oColumns).length);
        this._oViewModel.setProperty("/comparison/differences", oResult.differences);
        var oDifferenceCount = { MISSING: 0, EXTRA: 0, VALUE: 0,
          ALV_COLUMN_MISSING: 0 };
        oResult.differences.forEach(function (oDifference) { oDifferenceCount[oDifference.kind] += 1; });
        this._appendLegacyRunLog(oResult.status, "RESULT", "ALV=" + oResult.alvCount +
          " OData=" + oResult.odataCount + " Columns=" + (bEmptyCapture ? 0 : Object.keys(oColumns).length) +
          " Missing=" + oDifferenceCount.MISSING + " Extra=" + oDifferenceCount.EXTRA +
          " MissingAlvColumns=" + oDifferenceCount.ALV_COLUMN_MISSING +
          " Cells=" + oDifferenceCount.VALUE + ".");
      }.bind(this)).catch(function (oError) {
        if (iVersion === this._iLegacyComparisonVersion) { this._legacyInconclusive(oError, "COMPARE"); }
      }.bind(this)).finally(function () {
        if (iVersion === this._iLegacyComparisonVersion) { this._oViewModel.setProperty("/comparison/busy", false); }
      }.bind(this));
    },

    _legacyInconclusive: function (oError, sStep) {
      var oParsed = oError && this.parseError && this.parseError(oError);
      var sMessage = oParsed && oParsed.message && oParsed.message !== "Unexpected error." ?
        oParsed.message : oError && oError.message || String(oError);
      this._oViewModel.setProperty("/comparison/status", "INCONCLUSIVE");
      this._oViewModel.setProperty("/comparison/error", sMessage);
      this._oViewModel.setProperty("/comparison/reason", sMessage);
      this._oViewModel.setProperty("/comparison/differences", []);
      this._oViewModel.setProperty("/comparison/odataCount", null);
      this._oViewModel.setProperty("/comparison/comparedColumnCount", null);
      this._appendLegacyRunLog("INCONCLUSIVE", sStep || "RESULT", sMessage);
    },

    _openFioriUiPrepareDialog: function (sAnalysisId) {
      if (!this._pFioriUiPrepareDialog) {
        this._pFioriUiPrepareDialog = Fragment.load({
          id: this.getView().getId(),
          name: "abap.to.fiori.system.view.fragments.FioriUiPrepareDialog",
          controller: this
        }).then(function (oDialog) {
          this.getView().addDependent(oDialog);
          return oDialog;
        }.bind(this));
      }
      this._pFioriUiPrepareDialog.then(function (oDialog) {
        if (sAnalysisId === this._oViewModel.getProperty("/analysisId")) {
          oDialog.open();
        }
      }.bind(this)).catch(function (oError) {
        this.showError(oError, "fioriUiPrepareError");
        this._pFioriUiPrepareDialog = null;
      }.bind(this));
    },

    _openODataGenerationDialog: function (sAnalysisId) {
      if (!this._pODataGenerationDialog) {
        this._pODataGenerationDialog = Fragment.load({
          id: this.getView().getId(),
          name: "abap.to.fiori.system.view.fragments.ODataGenerationDialog",
          controller: this
        }).then(function (oDialog) {
          this.getView().addDependent(oDialog);
          return oDialog;
        }.bind(this));
      }
      this._pODataGenerationDialog.then(function (oDialog) {
        if (sAnalysisId === this._oViewModel.getProperty("/analysisId")) {
          oDialog.open();
          this._bODataGenerationDialogOpen = true;
          this._resumeODataGenerationPolling();
        }
      }.bind(this)).catch(function (oError) {
        this.showError(oError, "odataGenerationDialogError");
        this._pODataGenerationDialog = null;
      }.bind(this));
    },

    _validateODataGeneration: function (oState, bGenerate) {
      if (!String(oState && oState.targetPackage || "").trim()) {
        return this.getText("odataGenerationTargetPackageRequired");
      }
      if (String(oState && oState.providerLanguage || "").toUpperCase() === "STANDARD" &&
          !String(oState && oState.providerPackage || "").trim()) {
        return this.getText("odataGenerationProviderPackageRequired");
      }
      if (bGenerate && !String(oState && oState.transportRequest || "").trim()) {
        return this.getText("odataGenerationTransportRequired");
      }
      return "";
    },

    _setODataGenerationInputs: function (oParameters) {
      this._oViewModel.setProperty("/odataGeneration/targetPackage", oParameters.TargetPackage);
      this._oViewModel.setProperty("/odataGeneration/providerPackage", oParameters.ProviderPackage);
      this._oViewModel.setProperty("/odataGeneration/providerLanguage", oParameters.ProviderLanguage);
      this._oViewModel.setProperty("/odataGeneration/transportRequest", oParameters.TransportRequest);
    },

    _invalidateODataGenerationPreflight: function (bClearRequest) {
      this._cancelODataGenerationPolling();
      this._oViewModel.setProperty("/odataGeneration/preflightReady", false);
      this._oViewModel.setProperty("/odataGeneration/preflightSignature", "");
      this._oViewModel.setProperty("/odataGeneration/canGenerate", false);
      this._oViewModel.setProperty("/odataGeneration/error", "");
      if (bClearRequest !== false) {
        this._oViewModel.setProperty("/odataGeneration/requestId", "");
        this._oViewModel.setProperty("/odataGeneration/generationSignature", "");
      }
    },

    _applyODataGenerationResponse: function (oResponse) {
      var oParsed = ODataGeneration.parseResponse(oResponse);
      var sRequestId = ODataGeneration.isUsableRequestId(oParsed.requestId) ?
        oParsed.requestId : this._oViewModel.getProperty("/odataGeneration/requestId");
      var bFailure = oParsed.status === "BLOCKED" || oParsed.status === "FAILED" ||
        oParsed.status === "DISPATCH_FAILED";

      this._oViewModel.setProperty("/odataGeneration/requestId", sRequestId);
      this._oViewModel.setProperty("/odataGeneration/status", oParsed.status);
      this._oViewModel.setProperty("/odataGeneration/runtimeCheck", oParsed.runtimeCheck);
      this._oViewModel.setProperty("/odataGeneration/message", bFailure ? "" : oParsed.message);
      this._oViewModel.setProperty("/odataGeneration/result", oParsed.result);
      this._oViewModel.setProperty("/odataGeneration/resultJsonInvalid", oParsed.resultJsonInvalid);
      this._oViewModel.setProperty("/odataGeneration/hasResult", true);
      this._oViewModel.setProperty("/odataGeneration/error", bFailure ?
        oParsed.message || this.getText(oParsed.status === "BLOCKED" ? "odataGenerationBlocked" : "odataGenerationFailed") : "");
      return oParsed;
    },

    _handleODataGenerationStatus: function (oParsed, bStartPolling) {
      if (ODataGeneration.isGenerationActive(oParsed.status)) {
        if (bStartPolling) {
          this._startODataGenerationPolling();
        }
        return;
      }

      this._clearODataGenerationTimer();
      this._oViewModel.setProperty("/odataGeneration/polling", false);
      if (oParsed.status === "GENERATED") {
        this._oViewModel.setProperty("/odataGeneration/canGenerate", false);
        MessageToast.show(oParsed.message || this.getText("odataGenerationGenerated"));
      } else if (oParsed.status === "BLOCKED" || oParsed.status === "FAILED" ||
          oParsed.status === "DISPATCH_FAILED") {
        this._oViewModel.setProperty("/odataGeneration/error", oParsed.message ||
          this.getText(oParsed.status === "BLOCKED" ? "odataGenerationBlocked" : "odataGenerationFailed"));
      }
    },

    _startODataGenerationPolling: function () {
      this._clearODataGenerationTimer();
      this._oViewModel.setProperty("/odataGeneration/polling", true);
      this._scheduleODataGenerationPoll();
    },

    _resumeODataGenerationPolling: function () {
      var oState = this._oViewModel.getProperty("/odataGeneration");
      if (!this._bODataGenerationDialogOpen || oState.dialogBusy ||
          !ODataGeneration.isUsableRequestId(oState.requestId) ||
          !ODataGeneration.isGenerationActive(oState.status)) { return; }
      if (!oState.polling) {
        this._startODataGenerationPolling();
      } else if (!this._iODataGenerationTimer) {
        this._scheduleODataGenerationPoll();
      }
    },

    _scheduleODataGenerationPoll: function () {
      if (!this._bODataGenerationDialogOpen || this._iODataGenerationTimer ||
          !this._oViewModel.getProperty("/odataGeneration/polling")) { return; }
      this._iODataGenerationTimer = setTimeout(function () {
        this._iODataGenerationTimer = null;
        this._pollODataGeneration(false);
      }.bind(this), REQUEST_POLL_INTERVAL_MS);
    },

    _pollODataGeneration: function (bManual) {
      var sAnalysisId = this._oViewModel.getProperty("/analysisId");
      var sRequestId = this._oViewModel.getProperty("/odataGeneration/requestId");
      var iRequestVersion;

      if ((!bManual && !this._bODataGenerationDialogOpen) ||
          !sAnalysisId || !ODataGeneration.isUsableRequestId(sRequestId) ||
          this._oViewModel.getProperty("/odataGeneration/dialogBusy")) {
        if (!ODataGeneration.isUsableRequestId(sRequestId)) {
          this._oViewModel.setProperty("/odataGeneration/error", this.getText("odataGenerationRequestIdRequired"));
        }
        if (!bManual) { this._scheduleODataGenerationPoll(); }
        return;
      }

      iRequestVersion = this._iODataGenerationRequestVersion || 0;
      this._setODataGenerationBusy(true);
      this.getAnalysisService().getODataGeneration(sAnalysisId, sRequestId).then(function (oResponse) {
        var oParsed;
        if (iRequestVersion !== (this._iODataGenerationRequestVersion || 0) ||
            sAnalysisId !== this._oViewModel.getProperty("/analysisId")) {
          return;
        }
        oParsed = this._applyODataGenerationResponse(oResponse);
        this._handleODataGenerationStatus(oParsed, false);
      }.bind(this)).catch(function (oError) {
        if (iRequestVersion === (this._iODataGenerationRequestVersion || 0)) {
          this._showODataGenerationError(oError, "odataGenerationRefreshError");
        }
      }.bind(this)).finally(function () {
        if (iRequestVersion === (this._iODataGenerationRequestVersion || 0)) {
          this._setODataGenerationBusy(false);
          this._resumeODataGenerationPolling();
        }
      }.bind(this));
    },

    _setODataGenerationBusy: function (bBusy) {
      this._oViewModel.setProperty("/odataGeneration/dialogBusy", bBusy);
    },

    _showODataGenerationError: function (oError, sFallbackKey) {
      var sMessage = this.parseError(oError).message;
      this._oViewModel.setProperty("/odataGeneration/error", sMessage && sMessage !== "Unexpected error." ?
        sMessage : this.getText(sFallbackKey));
    },

    _clearODataGenerationTimer: function () {
      if (this._iODataGenerationTimer) {
        clearTimeout(this._iODataGenerationTimer);
        this._iODataGenerationTimer = null;
      }
    },

    _cancelODataGenerationPolling: function () {
      this._clearODataGenerationTimer();
      this._iODataGenerationRequestVersion = (this._iODataGenerationRequestVersion || 0) + 1;
      if (this._oViewModel) {
        this._oViewModel.setProperty("/odataGeneration/polling", false);
        this._oViewModel.setProperty("/odataGeneration/dialogBusy", false);
      }
    },
      },
    );
  },
);
