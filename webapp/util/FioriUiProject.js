sap.ui.define([], function () {
  "use strict";

  var EDM_NS = "http://docs.oasis-open.org/odata/ns/edm";
  var EDMX_NS = "http://docs.oasis-open.org/odata/ns/edmx";
  var UI_NS = "com.sap.vocabularies.UI.v1";
  var UI5_VERSION = "1.108.33";
  var PROXY_BASE_URI = "https://s40lp1.ucc.cit.tum.de/sap";

  function read(oObject, aNames) {
    if (!oObject || typeof oObject !== "object" || Array.isArray(oObject)) { return undefined; }
    var sKey = Object.keys(oObject).find(function (sCandidate) {
      return aNames.some(function (sName) {
        return sCandidate.replace(/[^a-z0-9]/gi, "").toLowerCase() ===
          sName.replace(/[^a-z0-9]/gi, "").toLowerCase();
      });
    });
    return sKey ? oObject[sKey] : undefined;
  }

  function value(oObject, aNames) {
    var vValue = read(oObject, aNames);
    return vValue === undefined || vValue === null ? "" : String(vValue).trim();
  }

  function list(vValue) { return Array.isArray(vValue) ? vValue : []; }
  function children(oNode, sName, sNamespace) {
    return Array.prototype.filter.call(oNode && oNode.childNodes || [], function (oChild) {
      return oChild.nodeType === 1 && oChild.localName === sName && oChild.namespaceURI === sNamespace;
    });
  }
  function descendants(oNode, sName, sNamespace) {
    var aFound = [];
    Array.prototype.forEach.call(oNode && oNode.childNodes || [], function (oChild) {
      if (oChild.nodeType === 1) {
        if (oChild.localName === sName && oChild.namespaceURI === sNamespace) { aFound.push(oChild); }
        aFound = aFound.concat(descendants(oChild, sName, sNamespace));
      }
    });
    return aFound;
  }
  function named(aNodes, sName) {
    return aNodes.find(function (oNode) { return oNode.getAttribute("Name") === sName; });
  }
  function qualified(sName, oSchema, mAliases) {
    var iDot = String(sName || "").lastIndexOf(".");
    if (iDot < 0) { return oSchema.getAttribute("Namespace") + "." + sName; }
    var sPrefix = sName.slice(0, iDot);
    return (mAliases[sPrefix] || sPrefix) + sName.slice(iDot);
  }
  function field(oValue) {
    return typeof oValue === "string" ? oValue.trim() : value(oValue,
      ["property", "propertyName", "fieldName", "field", "path", "name"]);
  }
  function pathValue(oPropertyValue) {
    if (!oPropertyValue) { return ""; }
    var sDirect = oPropertyValue.getAttribute("Path") || oPropertyValue.getAttribute("PropertyPath");
    var oNested = children(oPropertyValue, "Path", EDM_NS)[0] ||
      children(oPropertyValue, "PropertyPath", EDM_NS)[0];
    return String(sDirect || oNested && oNested.textContent || "").trim();
  }
  function paths(oPropertyValue) {
    var oCollection = children(oPropertyValue, "Collection", EDM_NS)[0];
    return oCollection ? children(oCollection, "PropertyPath", EDM_NS).map(function (oPath) {
      return String(oPath.textContent || "").trim();
    }) : [];
  }
  function propertyValue(oRecord, sName) {
    return children(oRecord, "PropertyValue", EDM_NS).find(function (oNode) {
      return oNode.getAttribute("Property") === sName;
    });
  }
  function annotationTerm(oNode, mAliases) {
    return qualified(oNode.getAttribute("Term"), { getAttribute: function () { return ""; } }, mAliases);
  }
  function sameFields(aExpected, aActual, sKind, aIssues) {
    if (aExpected.length !== aActual.length || aExpected.some(function (sName, iIndex) {
      return sName !== aActual[iIndex];
    })) {
      aIssues.push(sKind + " không khớp ConfigJson (kể cả thứ tự): expected [" +
        aExpected.join(", ") + "], metadata [" + aActual.join(", ") + "].");
    }
  }

  function inspect(sXml, oConfig, fnParser) {
    var aIssues = [];
    var oDocument;
    try {
      oDocument = fnParser ? fnParser(sXml) : new DOMParser().parseFromString(sXml, "application/xml");
    } catch (oError) {
      return { issues: ["Không thể đọc XML metadata: " + oError.message] };
    }
    if (!oDocument || !oDocument.documentElement || oDocument.documentElement.localName !== "Edmx" ||
        oDocument.documentElement.namespaceURI !== EDMX_NS ||
        oDocument.getElementsByTagName("parsererror").length) {
      return { issues: ["XML metadata không hợp lệ."] };
    }
    var aSchemas = descendants(oDocument.documentElement, "Schema", EDM_NS);
    var mAliases = { UI: UI_NS };
    descendants(oDocument.documentElement, "Include", EDMX_NS).forEach(function (oInclude) {
      if (oInclude.getAttribute("Alias")) {
        mAliases[oInclude.getAttribute("Alias")] = oInclude.getAttribute("Namespace");
      }
    });
    aSchemas.forEach(function (oSchema) {
      if (oSchema.getAttribute("Alias")) { mAliases[oSchema.getAttribute("Alias")] = oSchema.getAttribute("Namespace"); }
    });
    var sSetName = value(oConfig, ["entitySet", "entitySetName"]);
    var oSet, oContainer, oContainerSchema;
    aSchemas.some(function (oSchema) {
      return children(oSchema, "EntityContainer", EDM_NS).some(function (oCandidate) {
        var oMatch = named(children(oCandidate, "EntitySet", EDM_NS), sSetName);
        if (oMatch) { oSet = oMatch; oContainer = oCandidate; oContainerSchema = oSchema; }
        return !!oMatch;
      });
    });
    if (!oSet) { return { issues: ["EntitySet '" + sSetName + "' không tồn tại trong metadata."] }; }
    var sType = qualified(oSet.getAttribute("EntityType"), oContainerSchema, mAliases);
    var oType;
    aSchemas.some(function (oSchema) {
      var sNamespace = oSchema.getAttribute("Namespace") + ".";
      if (sType.indexOf(sNamespace) === 0) {
        oType = named(children(oSchema, "EntityType", EDM_NS), sType.slice(sNamespace.length));
      }
      return !!oType;
    });
    if (!oType) { return { issues: ["EntityType '" + sType + "' không tồn tại trong metadata."] }; }
    var sSetTarget = qualified(oContainer.getAttribute("Name"), oContainerSchema, mAliases) + "/" + sSetName;
    var aAnnotations = children(oType, "Annotation", EDM_NS).concat(children(oSet, "Annotation", EDM_NS));
    aSchemas.forEach(function (oSchema) {
      children(oSchema, "Annotations", EDM_NS).forEach(function (oGroup) {
        var sTarget = oGroup.getAttribute("Target") || "";
        var iSlash = sTarget.indexOf("/");
        var sBase = iSlash < 0 ? sTarget : sTarget.slice(0, iSlash);
        var sQualified = qualified(sBase, oSchema, mAliases) + (iSlash < 0 ? "" : sTarget.slice(iSlash));
        if (sQualified === sType || sQualified === sSetTarget) {
          aAnnotations = aAnnotations.concat(children(oGroup, "Annotation", EDM_NS));
        }
      });
    });
    function annotation(sName) {
      return aAnnotations.find(function (oNode) { return annotationTerm(oNode, mAliases) === UI_NS + "." + sName; });
    }
    var aProperties = children(oType, "Property", EDM_NS);
    var oLineItem = annotation("LineItem");
    var aLineFields = [];
    var oCollection = oLineItem && children(oLineItem, "Collection", EDM_NS)[0];
    if (read(oConfig, ["tableSupported"]) !== true) {
      aIssues.push("List Report yêu cầu tableSupported=true.");
    } else if (!oCollection) {
      aIssues.push("UI.LineItem của entity đang chọn không có Collection dữ liệu.");
    } else {
      children(oCollection, "Record", EDM_NS).forEach(function (oRecord) {
        var sTypeName = oRecord.getAttribute("Type") || "";
        var sPath = pathValue(propertyValue(oRecord, "Value"));
        if (sTypeName && !/(^|\.)DataField$/.test(sTypeName) || !sPath) {
          aIssues.push("UI.LineItem có record không phải DataField/Path; không thể bảo đảm cột read-only.");
        } else { aLineFields.push(sPath); }
      });
      sameFields(list(read(oConfig, ["columns"])).map(field), aLineFields, "UI.LineItem", aIssues);
    }
    var aFilters = list(read(oConfig, ["filters"])).map(field);
    if (aFilters.length && read(oConfig, ["filterSupported"]) !== true) {
      aIssues.push("ConfigJson có filters nhưng filterSupported=false.");
    }
    if (read(oConfig, ["filterSupported"]) === true && aFilters.length) {
      var oSelection = annotation("SelectionFields");
      var aSelection = oSelection && children(oSelection, "Collection", EDM_NS)[0];
      if (!aSelection) { aIssues.push("UI.SelectionFields của entity đang chọn không có Collection."); }
      else {
        sameFields(aFilters, children(aSelection, "PropertyPath", EDM_NS).map(function (oPath) {
          return String(oPath.textContent || "").trim();
        }), "UI.SelectionFields", aIssues);
      }
    }
    var sChartPath = "";
    if (read(oConfig, ["chartSupported"]) === true) {
      var oChart = annotation("Chart");
      var oChartRecord = oChart && children(oChart, "Record", EDM_NS)[0];
      var aDimensions = oChartRecord && paths(propertyValue(oChartRecord, "Dimensions")) || [];
      var aMeasures = oChartRecord && paths(propertyValue(oChartRecord, "Measures")) || [];
      if (read(oConfig, ["readOnly"]) === true && oChartRecord && propertyValue(oChartRecord, "Actions")) {
        aIssues.push("UI.Chart có action; project read-only không thể hiển thị chart này.");
      }
      if (!aDimensions.length || !aMeasures.length) {
        aIssues.push("UI.Chart cần ít nhất một Dimension và một Measure.");
      }
      aDimensions.concat(aMeasures).forEach(function (sName) {
        if (!named(aProperties, sName)) { aIssues.push("UI.Chart tham chiếu property '" + sName + "' không tồn tại."); }
      });
      aMeasures.forEach(function (sName) {
        var oProperty = named(aProperties, sName);
        if (oProperty && !/^Edm\.(Byte|SByte|Int16|Int32|Int64|Decimal|Double|Single)$/.test(oProperty.getAttribute("Type") || "")) {
          aIssues.push("UI.Chart Measure '" + sName + "' không có EDM type dạng số.");
        }
      });
      if (oChart) { sChartPath = "@UI.Chart" + (oChart.getAttribute("Qualifier") ? "#" + oChart.getAttribute("Qualifier") : ""); }
    }
    return { issues: aIssues, entitySetTarget: sSetTarget, entityType: sType, chartPath: sChartPath };
  }

  function safeIdentity(oConfig, oOptions) {
    var sTitle = value(oConfig, ["appTitle"]);
    var sAnalysisId = value(oConfig, ["analysisId"]);
    if (!sTitle || /[\\/\x00-\x1f]/.test(sTitle) || sTitle.indexOf("..") >= 0) {
      throw new Error("appTitle không hợp lệ cho tên project.");
    }
    if (!/^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$/.test(sAnalysisId)) {
      throw new Error("analysisId không hợp lệ.");
    }
    var sSlug = sTitle.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "").slice(0, 28);
    var sName = oOptions && oOptions.appName || "fe" + (sSlug || "listreport") + sAnalysisId.slice(0, 8).toLowerCase();
    var sNamespace = oOptions && oOptions.namespace || "generated.fe";
    var sFileName = oOptions && oOptions.fileName || sName + ".zip";
    if (!/^[a-z][a-z0-9]{1,49}$/.test(sName)) { throw new Error("Tên app không hợp lệ."); }
    if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(sNamespace)) { throw new Error("Namespace không hợp lệ."); }
    if (sFileName !== sName + ".zip") { throw new Error("Tên file ZIP không hợp lệ."); }
    return { appName: sName, namespace: sNamespace, appId: sNamespace + "." + sName, fileName: sFileName, title: sTitle };
  }

  function normalizeAnalysisId(vAnalysisId) {
    var sId = String(vAnalysisId || "").trim().toLowerCase();
    if (/^[0-9a-f]{32}$/.test(sId)) {
      return sId.slice(0, 8) + "-" + sId.slice(8, 12) + "-" + sId.slice(12, 16) + "-" +
        sId.slice(16, 20) + "-" + sId.slice(20);
    }
    if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(sId)) {
      return sId;
    }
    throw new Error("analysisId không hợp lệ.");
  }

  function serviceUri(oConfig) {
    var sRoot = value(oConfig, ["serviceRootUrl"]);
    var aParts = sRoot.split("?");
    if (aParts.length > 2 || !/^\/sap\/[A-Za-z0-9._~/-]+\/?$/.test(aParts[0]) ||
        aParts[0].split("/").some(function (sPart) { return sPart === "." || sPart === ".."; }) ||
        /\$metadata/i.test(sRoot) || (aParts[1] && aParts[1] !== "sap-client=324")) {
      throw new Error("serviceRootUrl phải là đường dẫn /sap/... hợp lệ, không chứa hostname hoặc $metadata.");
    }
    return aParts[0].replace(/\/+$/, "") + "/?sap-client=324";
  }

  function xmlEscape(sValue) {
    return String(sValue).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }
  function localAnnotations(oInfo, bReadOnly, bChart, sServiceUri) {
    if (!bReadOnly && !bChart) { return ""; }
    var aLines = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<edmx:Edmx Version="4.0" xmlns:edmx="' + EDMX_NS + '">',
      '  <edmx:Reference Uri="' + xmlEscape(sServiceUri.replace("?", "$metadata?")) + '">' +
        '<edmx:Include Namespace="' + xmlEscape(oInfo.entityType.slice(0, oInfo.entityType.lastIndexOf("."))) +
        '" Alias="Service"/></edmx:Reference>',
      '  <edmx:Reference Uri="https://sap.github.io/odata-vocabularies/vocabularies/UI.xml">' +
        '<edmx:Include Namespace="' + UI_NS + '" Alias="UI"/></edmx:Reference>',
      '  <edmx:Reference Uri="https://oasis-tcs.github.io/odata-vocabularies/vocabularies/Org.OData.Capabilities.V1.xml">' +
        '<edmx:Include Namespace="Org.OData.Capabilities.V1" Alias="Capabilities"/></edmx:Reference>',
      '  <edmx:DataServices><Schema Namespace="GeneratedAnnotations" xmlns="' + EDM_NS + '">'
    ];
    if (bReadOnly) {
      aLines.push('    <Annotations Target="' + xmlEscape(oInfo.entitySetTarget) + '">');
      ["InsertRestrictions|Insertable", "UpdateRestrictions|Updatable", "DeleteRestrictions|Deletable"].forEach(function (sRule) {
        var aRule = sRule.split("|");
        aLines.push('      <Annotation Term="Org.OData.Capabilities.V1.' + aRule[0] + '"><Record>' +
          '<PropertyValue Property="' + aRule[1] + '" Bool="false"/></Record></Annotation>');
      });
      aLines.push("    </Annotations>");
    }
    if (bChart) {
      aLines.push('    <Annotations Target="' + xmlEscape(oInfo.entityType) + '">');
      aLines.push('      <Annotation Term="' + UI_NS + '.SelectionVariant" Qualifier="GeneratedTable"><Record/></Annotation>');
      aLines.push('      <Annotation Term="' + UI_NS + '.SelectionPresentationVariant" Qualifier="GeneratedChart"><Record>' +
        '<PropertyValue Property="SelectionVariant"><Record/></PropertyValue>' +
        '<PropertyValue Property="PresentationVariant"><Record><PropertyValue Property="Visualizations">' +
        '<Collection><AnnotationPath>' + xmlEscape(oInfo.chartPath) + '</AnnotationPath></Collection>' +
        '</PropertyValue></Record></PropertyValue></Record></Annotation>');
      aLines.push("    </Annotations>");
    }
    aLines.push("  </Schema></edmx:DataServices>", "</edmx:Edmx>");
    return aLines.join("\n") + "\n";
  }

  function zip(oFiles, sFolder) {
    if (!/^[a-z][a-z0-9]{1,49}$/.test(sFolder)) { throw new Error("Tên thư mục ZIP không hợp lệ."); }
    var aBytes = [], aCentral = [];
    var oEncoder = new TextEncoder();
    var iDate = ((2024 - 1980) << 9) | (1 << 5) | 1;
    function u16(aTarget, iValue) { aTarget.push(iValue & 255, iValue >>> 8 & 255); }
    function u32(aTarget, iValue) { u16(aTarget, iValue & 65535); u16(aTarget, iValue >>> 16 & 65535); }
    function append(aTarget, aSource) { Array.prototype.push.apply(aTarget, aSource); }
    function crc32(aData) {
      var iCrc = -1;
      aData.forEach(function (iByte) {
        iCrc ^= iByte;
        for (var i = 0; i < 8; i += 1) { iCrc = iCrc >>> 1 ^ (iCrc & 1 ? 0xEDB88320 : 0); }
      });
      return (iCrc ^ -1) >>> 0;
    }
    var aNames = Object.keys(oFiles).sort();
    if (!aNames.length || aNames.length > 65535) { throw new Error("Số file ZIP không hợp lệ."); }
    aNames.forEach(function (sPath) {
      if (!/^[A-Za-z0-9._/-]+$/.test(sPath) || sPath.charAt(0) === "/" ||
          sPath.split("/").some(function (sPart) { return !sPart || sPart === "." || sPart === ".."; })) {
        throw new Error("Đường dẫn ZIP không hợp lệ: " + sPath);
      }
      var aName = oEncoder.encode(sFolder + "/" + sPath);
      var aData = oEncoder.encode(oFiles[sPath]);
      var iCrc = crc32(aData), iOffset = aBytes.length;
      if (aData.length > 0xFFFFFFFF || iOffset > 0xFFFFFFFF) { throw new Error("ZIP quá lớn."); }
      u32(aBytes, 0x04034b50); u16(aBytes, 20); u16(aBytes, 0x800); u16(aBytes, 0);
      u16(aBytes, 0); u16(aBytes, iDate); u32(aBytes, iCrc);
      u32(aBytes, aData.length); u32(aBytes, aData.length); u16(aBytes, aName.length); u16(aBytes, 0);
      append(aBytes, aName); append(aBytes, aData);
      u32(aCentral, 0x02014b50); u16(aCentral, 20); u16(aCentral, 20); u16(aCentral, 0x800);
      u16(aCentral, 0); u16(aCentral, 0); u16(aCentral, iDate); u32(aCentral, iCrc);
      u32(aCentral, aData.length); u32(aCentral, aData.length); u16(aCentral, aName.length);
      u16(aCentral, 0); u16(aCentral, 0); u16(aCentral, 0); u16(aCentral, 0);
      u32(aCentral, 0); u32(aCentral, iOffset); append(aCentral, aName);
    });
    var iCentralOffset = aBytes.length;
    append(aBytes, aCentral);
    u32(aBytes, 0x06054b50); u16(aBytes, 0); u16(aBytes, 0);
    u16(aBytes, aNames.length); u16(aBytes, aNames.length);
    u32(aBytes, aCentral.length); u32(aBytes, iCentralOffset); u16(aBytes, 0);
    return new Uint8Array(aBytes);
  }

  function build(oConfig, sXml, oOptions, fnParser) {
    var oIdentity = safeIdentity(oConfig, oOptions);
    var sServiceUri = serviceUri(oConfig);
    if (!value(oConfig, ["contractVersion"]) ||
        value(oConfig, ["template"]) !== "sap.fe.templates.ListReport" ||
        value(oConfig, ["odataVersion"]) !== "4.0") {
      throw new Error("ConfigJson phải có contractVersion, ListReport và OData V4.");
    }
    var sEntitySet = value(oConfig, ["entitySet", "entitySetName"]);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(sEntitySet)) { throw new Error("Tên EntitySet không hợp lệ."); }
    var oInfo = inspect(sXml, oConfig, fnParser);
    if (oInfo.issues.length) {
      var oError = new Error("Metadata chưa đủ để tạo List Report.");
      oError.issues = oInfo.issues;
      throw oError;
    }
    var bReadOnly = read(oConfig, ["readOnly"]) === true;
    var bChart = read(oConfig, ["chartSupported"]) === true;
    var sAnnotations = localAnnotations(oInfo, bReadOnly, bChart, sServiceUri);
    var oDataSources = {
      mainService: { uri: sServiceUri, type: "OData", settings: { odataVersion: "4.0" } }
    };
    if (sAnnotations) {
      oDataSources.mainService.settings.annotations = ["localAnnotations"];
      oDataSources.localAnnotations = { type: "ODataAnnotation", uri: "annotations/local.xml",
        settings: { localUri: "annotations/local.xml" } };
    }
    var oSettings = { entitySet: sEntitySet, variantManagement: "Page", initialLoad: true };
    if (bChart) {
      oSettings.views = { paths: [
        { key: "table", annotationPath: UI_NS + ".SelectionVariant#GeneratedTable" },
        { key: "chart", annotationPath: UI_NS + ".SelectionPresentationVariant#GeneratedChart" }
      ] };
    }
    var oManifest = {
      _version: "1.32.0",
      "sap.app": { id: oIdentity.appId, type: "application", i18n: "i18n/i18n.properties",
        applicationVersion: { version: "1.0.0" }, title: "{{appTitle}}", dataSources: oDataSources },
      "sap.ui": { technology: "UI5", deviceTypes: { desktop: true, tablet: true, phone: true } },
      "sap.ui5": {
        dependencies: { minUI5Version: UI5_VERSION, libs: { "sap.m": {}, "sap.ui.core": {}, "sap.fe.templates": {} } },
        models: {
          i18n: { type: "sap.ui.model.resource.ResourceModel", uri: "i18n/i18n.properties" },
          "": { dataSource: "mainService", preload: true, settings: {
            synchronizationMode: "None", operationMode: "Server", autoExpandSelect: true, earlyRequests: true
          } }
        },
        routing: { config: {}, routes: [{ pattern: ":?query:", name: "ListReport", target: "ListReport" }],
          targets: { ListReport: { type: "Component", id: "ListReport", name: "sap.fe.templates.ListReport",
            options: { settings: oSettings } } } },
        contentDensities: { compact: true, cozy: true }
      }
    };
    var sModulePath = oIdentity.appId.replace(/\./g, "/");
    var oFiles = {
      "package.json": JSON.stringify({ name: oIdentity.appName, version: "1.0.0", private: true,
        scripts: { start: "ui5 serve -o index.html", build: "ui5 build --clean-dest" },
        devDependencies: { "@ui5/cli": "^4.0.53", "ui5-middleware-simpleproxy": "3.7.1" }
      }, null, 2) + "\n",
      "ui5.yaml": 'specVersion: "4.0"\nmetadata:\n  name: ' + oIdentity.appName +
        '\ntype: application\nframework:\n  name: SAPUI5\n  version: "' + UI5_VERSION +
        '"\n  libraries:\n    - name: sap.m\n    - name: sap.ui.core\n    - name: sap.fe.templates\n    - name: themelib_sap_horizon\n' +
        'server:\n  customMiddleware:\n    - name: ui5-middleware-simpleproxy\n' +
        '      afterMiddleware: compression\n      mountPath: /sap\n' +
        '      configuration:\n        baseUri: "' + PROXY_BASE_URI + '"\n        strictSSL: false\n',
      "webapp/manifest.json": JSON.stringify(oManifest, null, 2) + "\n",
      "webapp/Component.js": 'sap.ui.define(["sap/ui/core/UIComponent"], function (UIComponent) {\n' +
        '  "use strict";\n  return UIComponent.extend("' + oIdentity.appId + '.Component", {\n' +
        '    metadata: { manifest: "json" },\n' +
        '    init: function () {\n      UIComponent.prototype.init.apply(this, arguments);\n' +
        '      this.getRouter().initialize();\n    }\n  });\n});\n',
      "webapp/index.html": '<!doctype html>\n<html><head><meta charset="utf-8"><title>Fiori Elements List Report</title>\n' +
        '<script id="sap-ui-bootstrap" src="resources/sap-ui-core.js" data-sap-ui-theme="sap_horizon" ' +
        'data-sap-ui-resourceroots=\'{"' + oIdentity.appId + '": "./"}\' ' +
        'data-sap-ui-compat-version="edge" data-sap-ui-async="true"></script>\n' +
        '<script>sap.ui.getCore().attachInit(function () { sap.ui.require(["sap/ui/core/Component", ' +
        '"sap/ui/core/ComponentContainer"], function (Component, ComponentContainer) { ' +
        'Component.create({name: "' + oIdentity.appId + '", manifest: true}).then(function (component) { ' +
        'new ComponentContainer({component: component, height: "100%", width: "100%"}).placeAt("container"); ' +
        '}); }); });</script></head><body class="sapUiBody sapUiSizeCompact">' +
        '<div id="container" style="height: 100%"></div></body></html>\n',
      "webapp/i18n/i18n.properties": "appTitle=" + oIdentity.title.replace(/[\\\r\n=:#]/g, function (sChar) {
        return "\\" + sChar;
      }) + "\n",
      "README.md": "# Fiori Elements List Report\n\n" +
        "Generated from a validated OData V4 PrepareFioriUi configuration. This ZIP contains a standalone UI5 app.\n\n" +
        "## Run locally\n\n1. Run `npm install`.\n2. Run `npm start` and open the URL shown by UI5 Tooling.\n" +
        "3. Confirm that the List Report renders the configured columns and filters.\n" +
        "4. In browser Network, inspect `GET " + sServiceUri.replace("?", "$metadata?") + "`.\n" +
        "5. Run the list search and inspect `GET " + sServiceUri.replace("?", sEntitySet + "?") + "` through `/sap/`.\n" +
        "6. Run `npm run build` for a production build.\n\n" +
        "The local proxy in `ui5.yaml` targets the same SAP development host as the analysis cockpit. " +
        "Use an authenticated SAP session and client 324. A generated ZIP does not prove that the UI or entity-set GET works; verify both separately.\n" +
        (bReadOnly ? "\nThis app is read-only. Local Capabilities annotations disable create, update, and delete.\n" : "")
    };
    if (sAnnotations) { oFiles["webapp/annotations/local.xml"] = sAnnotations; }
    return { files: oFiles, fileName: oIdentity.fileName, bytes: zip(oFiles, oIdentity.appName),
      appName: oIdentity.appName, manifest: oManifest };
  }

  return { inspect: inspect, safeIdentity: safeIdentity, normalizeAnalysisId: normalizeAnalysisId,
    serviceUri: serviceUri, zip: zip, build: build };
});
