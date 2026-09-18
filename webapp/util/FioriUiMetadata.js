sap.ui.define([], function () {
  "use strict";

  var EDMX_NS = "http://docs.oasis-open.org/odata/ns/edmx";
  var EDM_NS = "http://docs.oasis-open.org/odata/ns/edm";

  function read(oValue, aNames) {
    if (!oValue || typeof oValue !== "object" || Array.isArray(oValue)) {
      return undefined;
    }
    var sKey = Object.keys(oValue).find(function (sCandidate) {
      return aNames.some(function (sName) {
        return sCandidate.replace(/[^a-z0-9]/gi, "").toLowerCase() ===
          sName.replace(/[^a-z0-9]/gi, "").toLowerCase();
      });
    });
    return sKey ? oValue[sKey] : undefined;
  }

  function value(oValue, aNames) {
    return String(read(oValue, aNames) || "").trim();
  }

  function items(oValue) {
    return Array.isArray(oValue) ? oValue : [];
  }

  function oneOrMany(oValue) {
    return oValue === undefined || oValue === null || oValue === "" ? [] :
      (Array.isArray(oValue) ? oValue : [oValue]);
  }

  function children(oNode, sName, sNamespace) {
    return Array.prototype.filter.call(oNode && oNode.childNodes || [], function (oChild) {
      return oChild.nodeType === 1 && oChild.localName === sName && oChild.namespaceURI === sNamespace;
    });
  }

  function descendants(oNode, sName, sNamespace) {
    var aFound = [];
    Array.prototype.forEach.call(oNode && oNode.childNodes || [], function (oChild) {
      if (oChild.nodeType === 1) {
        if (oChild.localName === sName && oChild.namespaceURI === sNamespace) {
          aFound.push(oChild);
        }
        aFound = aFound.concat(descendants(oChild, sName, sNamespace));
      }
    });
    return aFound;
  }

  function named(aNodes, sName) {
    return aNodes.find(function (oNode) { return oNode.getAttribute("Name") === sName; });
  }

  function metadataUrl(oConfig) {
    var sExplicit = value(oConfig, ["metadataUrl"]);
    var sRoot = value(oConfig, ["serviceRootUrl"]);
    var iQuery;
    if (sExplicit) {
      return sExplicit;
    }
    if (!sRoot) {
      throw new Error("ConfigJson is missing metadataUrl and serviceRootUrl.");
    }
    iQuery = sRoot.search(/[?#]/);
    if (iQuery < 0) {
      return sRoot.replace(/\/+$/, "") + "/$metadata";
    }
    return sRoot.slice(0, iQuery).replace(/\/+$/, "") + "/$metadata" + sRoot.slice(iQuery);
  }

  function qualifiedName(sName, oSchema, mAliases) {
    var aParts = String(sName || "").split(".");
    if (aParts.length === 1) {
      return oSchema.getAttribute("Namespace") + "." + sName;
    }
    var sPrefix = aParts.slice(0, -1).join(".");
    return (mAliases[sPrefix] || sPrefix) + "." + aParts[aParts.length - 1];
  }

  function annotationTerm(sTerm, mAliases) {
    var sPrefix = String(sTerm || "").replace(/\.[^.]+$/, "");
    var sLocal = String(sTerm || "").split(".").pop();
    return (mAliases[sPrefix] || sPrefix) + "." + sLocal;
  }

  function propertyName(oItem) {
    return typeof oItem === "string" ? oItem.trim() : value(oItem,
      ["property", "propertyName", "fieldName", "field", "path", "name"]);
  }

  function validate(sXml, oConfig, fnParser) {
    var aIssues = [];
    var oDocument;
    try {
      oDocument = fnParser ? fnParser(sXml) : new DOMParser().parseFromString(sXml, "application/xml");
    } catch (oError) {
      return { status: "INVALID", issues: ["Invalid XML metadata: " + oError.message] };
    }
    var oRoot = oDocument && oDocument.documentElement;
    if (!oRoot || oRoot.localName !== "Edmx" || oRoot.namespaceURI !== EDMX_NS ||
        !/^4(?:\.\d+)?$/.test(oRoot.getAttribute("Version") || "") ||
        descendants(oDocument, "parsererror", "http://www.mozilla.org/newlayout/xml/parsererror.xml").length ||
        oDocument.getElementsByTagName("parsererror").length) {
      return { status: "INVALID", issues: ["Invalid XML metadata or unsupported OData V4 CSDL."] };
    }

    var aSchemas = descendants(oRoot, "Schema", EDM_NS);
    var mAliases = { UI: "com.sap.vocabularies.UI.v1" };
    descendants(oRoot, "Include", EDMX_NS).forEach(function (oInclude) {
      if (oInclude.getAttribute("Alias")) {
        mAliases[oInclude.getAttribute("Alias")] = oInclude.getAttribute("Namespace");
      }
    });
    aSchemas.forEach(function (oSchema) {
      if (oSchema.getAttribute("Alias")) {
        mAliases[oSchema.getAttribute("Alias")] = oSchema.getAttribute("Namespace");
      }
    });
    if (!aSchemas.length) {
      return { status: "INVALID", issues: ["XML metadata has no OData V4 Schema."] };
    }

    var sEntitySet = value(oConfig, ["entitySet", "entitySetName"]);
    var oSet;
    var oContainerSchema;
    var oContainer;
    aSchemas.some(function (oSchema) {
      return children(oSchema, "EntityContainer", EDM_NS).some(function (oCandidate) {
        var oFound = named(children(oCandidate, "EntitySet", EDM_NS), sEntitySet);
        if (oFound) {
          oSet = oFound;
          oContainer = oCandidate;
          oContainerSchema = oSchema;
        }
        return !!oFound;
      });
    });
    if (!sEntitySet || !oSet) {
      return { status: "INVALID", issues: ["EntitySet '" + sEntitySet + "' was not found in metadata."] };
    }

    var sType = qualifiedName(oSet.getAttribute("EntityType"), oContainerSchema, mAliases);
    var oType;
    aSchemas.some(function (oSchema) {
      if (sType.indexOf(oSchema.getAttribute("Namespace") + ".") === 0) {
        oType = named(children(oSchema, "EntityType", EDM_NS),
          sType.slice(oSchema.getAttribute("Namespace").length + 1));
      }
      return !!oType;
    });
    if (!oType) {
      return { status: "INVALID", issues: ["EntitySet '" + sEntitySet + "' references missing EntityType '" + sType + "'."] };
    }

    var aProperties = children(oType, "Property", EDM_NS);
    var aKeys = children(oType, "Key", EDM_NS).reduce(function (aNames, oKey) {
      return aNames.concat(children(oKey, "PropertyRef", EDM_NS).map(function (oRef) {
        return oRef.getAttribute("Name");
      }));
    }, []);
    if (!aKeys.length) {
      aIssues.push("EntityType '" + sType + "' has no Key.");
    }
    aKeys.forEach(function (sKey) {
      if (!named(aProperties, sKey)) {
        aIssues.push("Key '" + sKey + "' has no matching Property.");
      }
    });

    function checkProperty(sName, sContext, sExpectedType) {
      if (!sName) {
        aIssues.push(sContext + " is missing a property name.");
        return;
      }
      var oProperty = named(aProperties, sName);
      if (!oProperty) {
        aIssues.push(sContext + " '" + sName + "' does not exist in EntityType '" + sType + "'.");
      } else if (sExpectedType && oProperty.getAttribute("Type") !== sExpectedType) {
        aIssues.push(sContext + " '" + sName + "' has a mismatched EDM type: ConfigJson=" + sExpectedType +
          ", metadata=" + oProperty.getAttribute("Type") + ".");
      }
    }

    var aColumns = items(read(oConfig, ["columns"]));
    var aConfigKeys = [];
    aColumns.forEach(function (oColumn) {
      var sName = propertyName(oColumn);
      checkProperty(sName, "Column", value(oColumn, ["edmType"]));
      if (read(oColumn, ["isKey"]) === true) {
        aConfigKeys.push(sName);
        if (aKeys.indexOf(sName) < 0) {
          aIssues.push("Column '" + sName + "' is marked isKey but is not a metadata Key.");
        }
      }
      ["currencyProperty", "unitProperty"].forEach(function (sLink) {
        var sProperty = value(oColumn, [sLink]);
        if (sProperty) {
          checkProperty(sProperty, "Property " + sLink + " of column '" + sName + "'");
        }
      });
    });
    aKeys.forEach(function (sKey) {
      if (aConfigKeys.indexOf(sKey) < 0) {
        aIssues.push("Metadata Key '" + sKey + "' is not marked isKey in columns.");
      }
    });
    items(read(oConfig, ["filters"])).forEach(function (oFilter) {
      checkProperty(propertyName(oFilter), "Filter");
    });
    oneOrMany(read(oConfig, ["defaultSort"])).forEach(function (oSort) {
      checkProperty(propertyName(oSort), "DefaultSort");
    });

    var sSetTarget = qualifiedName(oContainer.getAttribute("Name"), oContainerSchema, mAliases) + "/" + sEntitySet;
    var aRelevant = children(oType, "Annotation", EDM_NS).concat(children(oSet, "Annotation", EDM_NS));
    aSchemas.forEach(function (oSchema) {
      children(oSchema, "Annotations", EDM_NS).forEach(function (oGroup) {
        var sTarget = oGroup.getAttribute("Target");
        var iSlash = sTarget.indexOf("/");
        var sBase = iSlash < 0 ? sTarget : sTarget.slice(0, iSlash);
        var sNormalized = qualifiedName(sBase, oSchema, mAliases) + (iSlash < 0 ? "" : sTarget.slice(iSlash));
        if (sNormalized === sType || sNormalized === sSetTarget) {
          aRelevant = aRelevant.concat(children(oGroup, "Annotation", EDM_NS));
        }
      });
    });
    function hasAnnotation(sName) {
      return aRelevant.some(function (oAnnotation) {
        return annotationTerm(oAnnotation.getAttribute("Term"), mAliases) ===
          "com.sap.vocabularies.UI.v1." + sName;
      });
    }
    if (read(oConfig, ["tableSupported"]) === true && !hasAnnotation("LineItem")) {
      aIssues.push("EntityType '" + sType + "' has no UI.LineItem.");
    }
    if (read(oConfig, ["filterSupported"]) === true && items(read(oConfig, ["filters"])).length &&
        !hasAnnotation("SelectionFields")) {
      aIssues.push("EntityType '" + sType + "' has no UI.SelectionFields.");
    }
    if (read(oConfig, ["chartSupported"]) === true && !hasAnnotation("Chart")) {
      aIssues.push("EntityType '" + sType + "' has no UI.Chart.");
    }
    return { status: aIssues.length ? "INVALID" : "VALIDATED", issues: aIssues };
  }

  function check(oConfig, fnFetch, fnParser) {
    var sUrl;
    try {
      sUrl = metadataUrl(oConfig);
    } catch (oError) {
      return Promise.resolve({ status: "INVALID", issues: [oError.message] });
    }
    var fnRequest = fnFetch || window.fetch.bind(window);
    return Promise.resolve().then(function () {
      return fnRequest(sUrl, { method: "GET", credentials: "include", headers: { Accept: "application/xml" } });
    }).then(function (oResponse) {
      if (!oResponse.ok) {
        throw new Error("HTTP " + oResponse.status + (oResponse.statusText ? " " + oResponse.statusText : ""));
      }
      return oResponse.text();
    }).then(function (sXml) {
      return validate(sXml, oConfig, fnParser);
    }).catch(function (oError) {
      return { status: "INVALID", issues: ["Could not validate metadata at " + sUrl + ": " + oError.message] };
    });
  }

  return { metadataUrl: metadataUrl, validate: validate, check: check };
});
