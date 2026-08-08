sap.ui.define([
  "abap/to/fiori/system/util/Constants",
  "abap/to/fiori/system/config/TechnicalFields",
  "abap/to/fiori/system/util/TableStateSanitizer"
], function (Constants, TechnicalFields, TableStateSanitizer) {
  "use strict";

  function field(key, labelKey, priority, options) {
    return Object.assign({
      key: key,
      stateKey: key.charAt(0).toLowerCase() + key.slice(1),
      labelKey: labelKey,
      type: "Edm.String",
      priority: priority,
      defaultVisible: priority === "P1",
      exportable: priority !== "P3",
      technical: TechnicalFields.isTechnical(key),
      personalizable: !TechnicalFields.isTechnical(key),
      sortable: true,
      groupable: false,
      filterable: true,
      width: "10rem",
      textAlign: "Begin",
      wrap: false,
      formatter: "formatText"
    }, options || {});
  }

  function boolField(key, labelKey, priority, options) {
    return field(key, labelKey, priority, Object.assign({
      type: "Edm.Boolean",
      width: "8rem",
      formatter: "formatBoolean"
    }, options || {}));
  }

  function numberField(key, labelKey, priority, options) {
    return field(key, labelKey, priority, Object.assign({
      type: "Edm.Int32",
      width: "7rem",
      textAlign: "End",
      formatter: "formatNumber"
    }, options || {}));
  }

  function guidField(key) {
    return field(key, key, "P3", {
      type: "Edm.Guid",
      defaultVisible: false,
      technical: true,
      personalizable: false,
      exportable: false,
      sortable: false,
      groupable: false,
      filterable: false,
      width: "18rem"
    });
  }

  var configs = {
    sourceObjects: {
      tableKey: "analysis.sourceObjects",
      titleKey: "sourceObjects",
      navigationPath: Constants.navigation.sourceObjects,
      exportSection: "",
      defaultSort: [{ path: "ObjectName", descending: false }],
      fields: [
        guidField("AnalysisId"),
        guidField("ItemId"),
        field("ObjectName", "objectName", "P1", { width: "14rem" }),
        field("ObjectType", "objectType", "P1", { width: "10rem", groupable: true }),
        field("ParentObject", "parentObject", "P1", { width: "14rem" }),
        numberField("IncludeDepth", "includeDepth", "P1"),
        numberField("LineCount", "lineCount", "P1"),
        field("SourceHash", "sourceHash", "P2", { width: "18rem", technical: true, personalizable: false, exportable: false, sortable: false, groupable: false, filterable: false })
      ]
    },
    uiFilters: {
      tableKey: "analysis.uiFilters",
      titleKey: "uiFilters",
      navigationPath: Constants.navigation.uiFilters,
      exportSection: Constants.exportSection.uiFilter,
      exportFields: ["FieldName", "FieldKind", "ReferenceTable", "ReferenceField", "DataElement", "Mandatory", "MultipleSelection", "Confidence"],
      fields: [
        guidField("AnalysisId"),
        guidField("ItemId"),
        guidField("EvidenceId"),
        field("FieldName", "fieldName", "P1", { width: "12rem" }),
        field("FieldKind", "fieldKind", "P1", { width: "9rem", groupable: true }),
        field("ReferenceTable", "referenceTable", "P1", { width: "12rem" }),
        field("ReferenceField", "referenceField", "P1", { width: "12rem" }),
        field("DataElement", "dataElement", "P1", { width: "12rem" }),
        field("DataType", "dataType", "P2"),
        field("Description", "description", "P2", { width: "16rem", wrap: true }),
        field("SelectionBlock", "selectionBlock", "P2", { width: "12rem" }),
        boolField("Mandatory", "mandatory", "P1"),
        boolField("Hidden", "hidden", "P2"),
        boolField("Checkbox", "checkbox", "P2"),
        field("RadioGroup", "radioGroup", "P2"),
        boolField("MultipleSelection", "multipleSelection", "P1"),
        boolField("RangeSupported", "rangeSupported", "P2"),
        field("DefaultValue", "defaultValue", "P2", { width: "12rem" }),
        field("ValidationRoutine", "validationRoutine", "P2", { width: "14rem" }),
        field("Confidence", "confidence", "P1", { width: "8rem" })
      ]
    },
    databaseObjects: {
      tableKey: "analysis.databaseObjects",
      titleKey: "databaseObjects",
      navigationPath: Constants.navigation.databaseObjects,
      exportSection: Constants.exportSection.databaseObjects,
      exportFields: ["ObjectName", "ObjectType", "Operation", "ContainingRoutine", "DynamicAccess", "ReadOnly", "PagingCapability", "Confidence"],
      fields: [
        guidField("AnalysisId"), guidField("ItemId"), guidField("EvidenceId"),
        field("ObjectName", "objectName", "P1", { width: "14rem" }),
        field("ObjectType", "objectType", "P1"),
        field("Operation", "operation", "P1", { groupable: true }),
        field("SelectedFields", "selectedFields", "P2", { width: "16rem", wrap: true }),
        field("WhereFields", "whereFields", "P2", { width: "16rem", wrap: true }),
        field("JoinedObjects", "joinedObjects", "P2", { width: "16rem", wrap: true }),
        field("JoinCondition", "joinCondition", "P2", { width: "16rem", wrap: true }),
        field("Aggregation", "aggregation", "P2", { width: "14rem", wrap: true }),
        field("ContainingRoutine", "containingRoutine", "P1", { width: "14rem" }),
        boolField("DynamicAccess", "dynamicAccess", "P1"),
        boolField("ReadOnly", "readOnly", "P1"),
        field("PagingCapability", "pagingCapability", "P1", { width: "12rem" }),
        field("Description", "description", "P2", { width: "16rem", wrap: true }),
        field("Confidence", "confidence", "P1", { width: "8rem" })
      ]
    },
    businessLogic: {
      tableKey: "analysis.businessLogic",
      titleKey: "businessLogic",
      navigationPath: Constants.navigation.businessLogic,
      exportSection: Constants.exportSection.businessLogic,
      exportFields: ["ObjectName", "ObjectType", "ContainerName", "CallingRoutine", "SideEffect", "GuiDependency", "ReuseFeasibility", "Confidence"],
      fields: [
        guidField("AnalysisId"), guidField("ItemId"), guidField("EvidenceId"),
        field("ObjectName", "objectName", "P1", { width: "14rem" }),
        field("ObjectType", "objectType", "P1", { groupable: true }),
        field("ContainerName", "containerName", "P1", { width: "14rem" }),
        field("CallingRoutine", "callingRoutine", "P1", { width: "14rem" }),
        field("InterfaceSummary", "interfaceSummary", "P2", { width: "18rem", wrap: true }),
        field("Description", "description", "P2", { width: "16rem", wrap: true }),
        boolField("SideEffect", "sideEffect", "P1", { groupable: true }),
        boolField("TransactionDependency", "transactionDependency", "P2"),
        boolField("GuiDependency", "guiDependency", "P1", { groupable: true }),
        field("ReuseFeasibility", "reuseFeasibility", "P1", { width: "12rem", groupable: true }),
        field("Confidence", "confidence", "P1", { width: "8rem" })
      ]
    },
    alvOutputs: {
      tableKey: "analysis.alvOutputs",
      titleKey: "alvOutputs",
      navigationPath: Constants.navigation.alvOutputs,
      exportSection: Constants.exportSection.alvOutput,
      exportFields: ["OutputName", "OutputKind", "Framework", "OutputTable", "RowType", "Editable", "Confidence"],
      fields: [
        guidField("AnalysisId"), guidField("OutputId"), guidField("EvidenceId"), guidField("LayoutEvidenceId"),
        field("OutputName", "outputName", "P1", { width: "14rem" }),
        field("OutputKind", "outputKind", "P1", { groupable: true }),
        field("Framework", "framework", "P1", { groupable: true }),
        field("ControlObject", "controlObject", "P2", { width: "12rem" }),
        field("OutputTable", "outputTable", "P1", { width: "12rem" }),
        field("RowType", "rowType", "P1", { width: "12rem" }),
        field("FieldCatalog", "fieldCatalog", "P2", { width: "12rem" }),
        field("SortTable", "sortTable", "P2", { width: "12rem" }),
        field("FilterTable", "filterTable", "P2", { width: "12rem" }),
        field("LayoutObject", "layoutObject", "P2", { width: "12rem" }),
        field("VariantObject", "variantObject", "P2", { width: "12rem" }),
        boolField("Editable", "editable", "P1", { groupable: true }),
        boolField("Hierarchical", "hierarchical", "P2"),
        boolField("Zebra", "zebra", "P2"),
        boolField("AutoWidth", "autoWidth", "P2"),
        field("SelectionMode", "selectionMode", "P2"),
        field("Confidence", "confidence", "P1", { width: "8rem" })
      ]
    },
    alvColumns: {
      tableKey: "alvOutput.columns",
      titleKey: "alvColumns",
      navigationPath: Constants.navigation.alvColumns,
      exportSection: "",
      defaultSort: [{ path: "ColumnPosition", descending: false }],
      fields: [
        guidField("AnalysisId"), guidField("OutputId"), guidField("ItemId"), guidField("EvidenceId"),
        field("FieldName", "fieldName", "P1", { width: "12rem" }),
        field("ColumnLabel", "columnLabel", "P1", { width: "14rem" }),
        numberField("ColumnPosition", "columnPosition", "P1"),
        field("DataType", "dataType", "P1"),
        field("DataElement", "dataElement", "P1", { width: "12rem" }),
        field("ReferenceTable", "referenceTable", "P1", { width: "12rem" }),
        field("ReferenceField", "referenceField", "P1", { width: "12rem" }),
        numberField("FieldLength", "fieldLength", "P2"),
        numberField("Decimals", "decimals", "P2"),
        boolField("Visible", "visible", "P1"),
        boolField("KeyField", "keyField", "P1"),
        boolField("Technical", "technical", "P2"),
        boolField("Editable", "editable", "P1"),
        boolField("Hotspot", "hotspot", "P2"),
        boolField("Checkbox", "checkbox", "P2"),
        boolField("Icon", "icon", "P2"),
        field("CurrencyField", "currencyField", "P2"),
        field("UnitField", "unitField", "P2"),
        field("Aggregation", "aggregation", "P2"),
        field("SourceMapping", "sourceMapping", "P2", { width: "18rem", wrap: true }),
        field("Confidence", "confidence", "P1", { width: "8rem" })
      ]
    },
    alvSorts: {
      tableKey: "alvOutput.sorts",
      titleKey: "alvSorts",
      navigationPath: Constants.navigation.alvSorts,
      exportSection: "",
      defaultSort: [{ path: "SortPosition", descending: false }],
      fields: [
        guidField("AnalysisId"), guidField("OutputId"), guidField("ItemId"), guidField("EvidenceId"),
        field("FieldName", "fieldName", "P1", { width: "12rem" }),
        numberField("SortPosition", "sortPosition", "P1"),
        boolField("IsAscending", "isAscending", "P1"),
        boolField("IsDescending", "isDescending", "P1"),
        boolField("Subtotal", "subtotal", "P1"),
        field("Confidence", "confidence", "P1", { width: "8rem" })
      ]
    },
    alvFilters: {
      tableKey: "alvOutput.filters",
      titleKey: "alvFilters",
      navigationPath: Constants.navigation.alvFilters,
      exportSection: "",
      fields: [
        guidField("AnalysisId"), guidField("OutputId"), guidField("ItemId"), guidField("EvidenceId"),
        field("FieldName", "fieldName", "P1", { width: "12rem" }),
        field("FilterSign", "filterSign", "P1"),
        field("FilterOption", "filterOption", "P1"),
        field("LowValue", "lowValue", "P1", { width: "12rem" }),
        field("HighValue", "highValue", "P1", { width: "12rem" }),
        field("Confidence", "confidence", "P1", { width: "8rem" })
      ]
    },
    alvEvents: {
      tableKey: "alvOutput.events",
      titleKey: "alvEvents",
      navigationPath: Constants.navigation.alvEvents,
      exportSection: "",
      fields: [
        guidField("AnalysisId"), guidField("OutputId"), guidField("ItemId"), guidField("EvidenceId"),
        field("EventName", "eventName", "P1", { width: "14rem" }),
        field("HandlerName", "handlerName", "P1", { width: "14rem" }),
        field("HandlerKind", "handlerKind", "P1"),
        field("ControlObject", "controlObject", "P1", { width: "12rem" }),
        boolField("GuiDependency", "guiDependency", "P1", { groupable: true }),
        field("Confidence", "confidence", "P1", { width: "8rem" })
      ]
    },
    recommendations: {
      tableKey: "analysis.recommendations",
      titleKey: "recommendationsTabTitle",
      navigationPath: Constants.navigation.recommendations,
      exportSection: Constants.exportSection.recommendations,
      exportFields: ["Severity", "Title", "TargetLayer", "ReviewStatus", "ManualReview", "Confidence"],
      fields: [
        guidField("AnalysisId"), guidField("RecommendationId"), guidField("SourceItemId"), guidField("EvidenceId"),
        field("RuleId", "ruleId", "P2", { width: "12rem", technical: true, personalizable: false, exportable: false, sortable: false, groupable: false, filterable: false }),
        field("RuleVersion", "ruleVersion", "P2"),
        field("TargetLayer", "targetLayer", "P1", { width: "10rem", groupable: true }),
        field("Title", "title", "P1", { width: "18rem", wrap: true }),
        field("DisplayText", "displayText", "P2", { width: "18rem", wrap: true }),
        field("Explanation", "explanation", "P2", { width: "18rem", wrap: true }),
        field("Severity", "severity", "P1", { width: "8rem", formatter: "formatSeverityState", groupable: true }),
        field("Confidence", "confidence", "P1", { width: "8rem" }),
        field("ReviewStatus", "reviewStatus", "P1", { width: "10rem", groupable: true }),
        boolField("ManualReview", "manualReview", "P1")
      ]
    },
    annotations: {
      tableKey: "recommendation.annotations",
      titleKey: "annotations",
      navigationPath: Constants.navigation.annotations,
      exportSection: "",
      defaultSort: [{ path: "AnnotationSequence", descending: false }],
      fields: [
        guidField("AnalysisId"), guidField("RecommendationId"), guidField("ItemId"),
        field("TargetEntity", "targetEntity", "P1", { width: "14rem" }),
        field("TargetElement", "targetElement", "P1", { width: "14rem" }),
        field("AnnotationName", "annotationName", "P1", { width: "16rem" }),
        field("AnnotationValue", "annotationValue", "P1", { width: "22rem", wrap: true }),
        numberField("AnnotationSequence", "annotationSequence", "P1")
      ]
    },
    evidences: {
      tableKey: "analysis.evidences",
      titleKey: "evidence",
      navigationPath: Constants.navigation.evidences,
      exportSection: Constants.exportSection.sourceEvidence,
      exportFields: ["SourceObject", "StartLine", "EndLine", "StatementId", "Confidence"],
      fields: [
        guidField("AnalysisId"), guidField("EvidenceId"),
        field("SourceObject", "sourceObject", "P1", { width: "14rem" }),
        numberField("StartLine", "startLine", "P1"),
        numberField("EndLine", "endLine", "P1"),
        numberField("StatementId", "statementId", "P1", { technical: true, personalizable: false, exportable: false, sortable: false, groupable: false, filterable: false }),
        field("StatementText", "statementText", "P2", { width: "22rem", wrap: true }),
        field("Confidence", "confidence", "P1", { width: "8rem" })
      ]
    },
    messages: {
      tableKey: "analysis.messages",
      titleKey: "messages",
      navigationPath: Constants.navigation.messages,
      exportSection: Constants.exportSection.messages,
      exportFields: ["MessageType", "MessageCode", "SourceObject", "SourceLine", "MessageText"],
      fields: [
        guidField("AnalysisId"),
        numberField("MessageNo", "messageNo", "P3", { exportable: false }),
        field("MessageType", "messageType", "P1", { width: "8rem", formatter: "formatSeverityState", groupable: true }),
        field("MessageCode", "messageCode", "P1", { width: "12rem" }),
        field("SourceObject", "sourceObject", "P1", { width: "14rem" }),
        numberField("SourceLine", "sourceLine", "P1"),
        field("MessageText", "messageText", "P1", { width: "24rem", wrap: true })
      ]
    }
  };

  function getConfig(sKey) {
    return configs[sKey];
  }

  function getColumnDefaults(sKey) {
    var oConfig = getConfig(sKey);
    var mColumns = {};

    TableStateSanitizer.getAllowedFields(oConfig).forEach(function (oField) {
      mColumns[oField.stateKey] = oField.defaultVisible === true;
    });

    return mColumns;
  }

  function getAllColumnDefaults() {
    var mResult = {};
    Object.keys(configs).forEach(function (sKey) {
      mResult[sKey] = getColumnDefaults(sKey);
    });
    return mResult;
  }

  function getExportableFields(sKey, mColumnState) {
    var mState = mColumnState || {};
    var oConfig = getConfig(sKey);
    var aExportFields = oConfig && oConfig.exportFields;

    return TableStateSanitizer.getAllowedFields(oConfig).filter(function (oField) {
      return oField.exportable === true &&
        (!aExportFields || aExportFields.indexOf(oField.key) !== -1) &&
        mState[oField.stateKey] === true;
    });
  }

  function getPersonalizableFields(sKey) {
    return TableStateSanitizer.getAllowedFields(getConfig(sKey));
  }

  return Object.freeze({
    configs: configs,
    getConfig: getConfig,
    getColumnDefaults: getColumnDefaults,
    getAllColumnDefaults: getAllColumnDefaults,
    getExportableFields: getExportableFields,
    getPersonalizableFields: getPersonalizableFields
  });
});
