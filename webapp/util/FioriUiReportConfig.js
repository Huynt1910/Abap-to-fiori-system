sap.ui.define(["abap/to/fiori/system/util/FioriUiProject"], function (FioriUiProject) {
  "use strict";

  function read(oValue, aNames) {
    if (!oValue || typeof oValue !== "object" || Array.isArray(oValue)) { return undefined; }
    var sKey = Object.keys(oValue).find(function (sCandidate) {
      return aNames.some(function (sName) {
        return sCandidate.replace(/[^a-z0-9]/gi, "").toLowerCase() ===
          sName.replace(/[^a-z0-9]/gi, "").toLowerCase();
      });
    });
    return sKey ? oValue[sKey] : undefined;
  }

  function value(oValue, aNames) {
    var vResult = read(oValue, aNames);
    return vResult === undefined || vResult === null ? "" : String(vResult).trim();
  }

  function property(oItem) {
    return typeof oItem === "string" ? oItem.trim() : value(oItem,
      ["property", "propertyName", "fieldName", "field", "path", "name"]);
  }

  function serviceUrl(sRoot) {
    var sValue = String(sRoot || "").trim();
    var aParts = sValue.split("?");
    var sPath = aParts[0];
    if (aParts.length > 2 || !/^\/sap\/[A-Za-z0-9._~/-]+\/?$/.test(sPath) ||
        sPath.indexOf("//") >= 0 || sPath.split("/").some(function (sPart) {
          return sPart === "." || sPart === "..";
        }) || /\$metadata/i.test(sValue) ||
        (aParts[1] && !/^sap-client=[0-9]{1,3}$/.test(aParts[1]))) {
      throw new Error("serviceRootUrl phải là đường dẫn /sap/... qua proxy, không chứa hostname hoặc $metadata.");
    }
    return sPath.replace(/\/+$/, "") + "/" + (aParts[1] ? "?" + aParts[1] : "");
  }

  function assertService(oConfig, sInputUrl) {
    var sInputRoot = serviceUrl(sInputUrl);
    var sConfigRoot = serviceUrl(value(oConfig, ["serviceRootUrl"]));
    if (sInputRoot !== sConfigRoot) {
      throw new Error("ConfigJson.serviceRootUrl không khớp ServiceRootUrl đã kiểm tra.");
    }
    var sMetadataUrl = value(oConfig, ["metadataUrl"]);
    if (sMetadataUrl) {
      var sExpected = sConfigRoot.replace(/\?(.*)$/, "").replace(/\/$/, "/$metadata") +
        (sConfigRoot.indexOf("?") >= 0 ? sConfigRoot.slice(sConfigRoot.indexOf("?")) : "");
      if (sMetadataUrl !== sExpected) {
        throw new Error("ConfigJson.metadataUrl không thuộc service root qua proxy /sap.");
      }
    }
    return sConfigRoot;
  }

  function assertCurrent(oState, sAnalysisId, sRouteAnalysisId, sSignature) {
    if (!oState || oState.busy || !oState.hasResult || oState.status !== "CONFIG_READY" ||
        oState.metadataStatus !== "VALIDATED" || !oState.metadataSignature ||
        oState.metadataSignature !== sSignature || !oState.config) {
      throw new Error("Cần Prepare CONFIG_READY và Metadata VALIDATED cho cấu hình hiện tại.");
    }
    var sOpen = FioriUiProject.normalizeAnalysisId(sAnalysisId);
    var sConfig = FioriUiProject.normalizeAnalysisId(oState.configAnalysisId ||
      value(oState.config, ["analysisId"]));
    if (sRouteAnalysisId && FioriUiProject.normalizeAnalysisId(sRouteAnalysisId) !== sOpen) {
      throw new Error("Route analysisId không khớp analysis đang mở.");
    }
    if (sConfig !== sOpen) {
      throw new Error("ConfigJson.analysisId không khớp analysis đang mở.");
    }
    if (oState.prepareAnalysisId && FioriUiProject.normalizeAnalysisId(oState.prepareAnalysisId) !== sOpen) {
      throw new Error("PrepareFioriUi.AnalysisId không khớp analysis đang mở.");
    }
    return assertService(oState.config, oState.serviceRootUrl);
  }

  function annotation(oNode, sName) {
    if (!oNode) { return undefined; }
    return oNode["@com.sap.vocabularies.UI.v1." + sName] || oNode["@UI." + sName];
  }

  function label(oNode) {
    var vLabel = oNode && (oNode["@com.sap.vocabularies.Common.v1.Label"] ||
      oNode["@Common.Label"] || oNode.Label);
    return typeof vLabel === "string" ? vLabel : "";
  }

  function entitySet(oConfig) {
    var sEntitySet = value(oConfig, ["entitySet", "entitySetName"]);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(sEntitySet)) {
      throw new Error("ConfigJson.entitySet không hợp lệ.");
    }
    return sEntitySet;
  }

  function select(oConfig, oRuntime, sServiceUrl) {
    var sEntitySet = entitySet(oConfig);
    var oContainer = oRuntime && oRuntime.container;
    var oSet = oContainer && oContainer[sEntitySet];
    if (!oSet || oSet.$kind !== "EntitySet") {
      var aAvailable = Object.keys(oContainer || {}).filter(function (sName) {
        return oContainer[sName] && oContainer[sName].$kind === "EntitySet";
      });
      throw new Error("EntitySet '" + sEntitySet + "' không tồn tại trong metadata runtime. " +
        "Service URL: " + sServiceUrl + ". Các EntitySet hiện có: " +
        (aAvailable.length ? aAvailable.join(", ") : "(không có)") + ".");
    }
    if (!oSet.$Type) {
      throw new Error("EntitySet '" + sEntitySet + "' thiếu EntityType trong metadata runtime tại " +
        sServiceUrl + ".");
    }
    var oType = oRuntime.type;
    if (!oType || oType.$kind !== "EntityType") {
      throw new Error("EntityType của '" + sEntitySet + "' không tồn tại trong metadata runtime tại " +
        sServiceUrl + ".");
    }

    function checked(sName, sContext) {
      var oProperty = /^[A-Za-z_][A-Za-z0-9_]*$/.test(sName) && oType[sName];
      if (!oProperty || oProperty.$kind !== "Property" || !/^Edm\./.test(oProperty.$Type || "")) {
        throw new Error(sContext + " '" + sName + "' không phải property EDM của EntitySet '" + sEntitySet + "'.");
      }
      return oProperty;
    }

    var aConfigured = Array.isArray(read(oConfig, ["columns"])) ? read(oConfig, ["columns"]) : [];
    var mConfigColumns = {};
    aConfigured.forEach(function (oColumn) {
      var sName = property(oColumn);
      checked(sName, "Column");
      mConfigColumns[sName] = oColumn;
    });
    var aLineItem = oRuntime.lineItem || annotation(oType, "LineItem") || annotation(oSet, "LineItem") || [];
    var aNames = [];
    var mLineLabels = {};
    if (Array.isArray(aLineItem)) {
      aLineItem.forEach(function (oRecord) {
        var sName = oRecord && oRecord.Value && oRecord.Value.$Path;
        if (sName && (!oRecord.$Type || /(?:^|\.)DataField$/.test(oRecord.$Type))) {
          checked(sName, "UI.LineItem");
          if (aNames.indexOf(sName) < 0) { aNames.push(sName); }
          mLineLabels[sName] = label(oRecord);
        }
      });
    }
    if (!aNames.length) {
      aConfigured.forEach(function (oColumn) {
        var sName = property(oColumn);
        if (aNames.indexOf(sName) < 0) { aNames.push(sName); }
      });
    }
    if (!aNames.length) {
      throw new Error("UI.LineItem và ConfigJson.columns không có cột hiển thị hợp lệ.");
    }
    var aColumns = aNames.map(function (sName) {
      var oProperty = checked(sName, "Column");
      return { property: sName, label: mLineLabels[sName] || label(oProperty) ||
        value(mConfigColumns[sName], ["label", "title", "description"]) || sName };
    });

    var aFilters = (read(oConfig, ["filters"]) || []);
    if (!Array.isArray(aFilters)) { throw new Error("ConfigJson.filters không hợp lệ."); }
    aFilters = aFilters.map(function (oFilter) {
      var sName = property(oFilter);
      var oProperty = checked(sName, "Filter");
      var sKind = value(oFilter, ["filterType", "selectionType", "kind", "mode", "type"]) || "SCALAR";
      if (/^Edm\./.test(sKind)) { sKind = "SCALAR"; }
      var sOperator = value(oFilter, ["operator", "comparisonOperator"]) || "EQ";
      var bSupported = sKind.toUpperCase() === "SCALAR" && sOperator.toUpperCase() === "EQ" &&
        oProperty.$Type === "Edm.String";
      return { property: sName, label: label(oProperty) ||
        value(oFilter, ["label", "title", "description"]) || sName,
      supported: bSupported, reason: bSupported ? "" :
        sName + ": chỉ hỗ trợ filter chuỗi SCALAR với phép EQ (ConfigJson: " +
        sKind + "/" + sOperator + ", metadata: " + oProperty.$Type + ")." };
    });
    var aSort = read(oConfig, ["defaultSort"]);
    aSort = aSort === undefined || aSort === null || aSort === "" ? [] :
      (Array.isArray(aSort) ? aSort : [aSort]);
    aSort = aSort.map(function (oSort) {
      var sName = property(oSort);
      checked(sName, "DefaultSort");
      var sDirection = value(oSort, ["direction", "order", "sortOrder"]);
      return { property: sName, descending: read(oSort, ["descending", "isDescending"]) === true ||
        /^desc(?:ending)?$/i.test(sDirection) };
    });
    return { entitySet: sEntitySet, columns: aColumns, filters: aFilters, defaultSort: aSort };
  }

  return { serviceUrl: serviceUrl, assertService: assertService,
    assertCurrent: assertCurrent, entitySet: entitySet, select: select };
});
