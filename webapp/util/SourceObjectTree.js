sap.ui.define([], function () {
  "use strict";

  function asText(vValue) {
    return vValue === null || vValue === undefined ? "" : String(vValue).trim();
  }

  function getDepth(oSourceObject) {
    var vDepth = oSourceObject && (oSourceObject.IncludeDepth !== undefined ? oSourceObject.IncludeDepth : oSourceObject.Depth);
    var iDepth = Number(vDepth);

    return Number.isFinite(iDepth) && iDepth >= 0 ? Math.floor(iDepth) : 0;
  }

  function getStableKey(oSourceObject) {
    var sItemId = asText(oSourceObject && oSourceObject.ItemId);

    if (sItemId) {
      return sItemId;
    }

    return [
      asText(oSourceObject && oSourceObject.AnalysisId),
      asText(oSourceObject && oSourceObject.ObjectName),
      asText(oSourceObject && oSourceObject.ParentObject),
      getDepth(oSourceObject)
    ].join("|");
  }

  function getIcon(sObjectType) {
    var sType = asText(sObjectType).toUpperCase().replace(/[\s-]+/g, "_");

    if (sType === "PROGRAM") {
      return "sap-icon://source-code";
    }
    if (sType === "INCLUDE") {
      return "sap-icon://document-text";
    }
    if (sType.indexOf("CLASS") !== -1) {
      return "sap-icon://technical-object";
    }
    if (sType.indexOf("FUNCTION") !== -1) {
      return "sap-icon://folder-full";
    }
    return "sap-icon://document";
  }

  function build(aSourceObjects) {
    var aRows = Array.isArray(aSourceObjects) ? aSourceObjects : [];
    var aWarnings = [];
    var mNameNodes = new Map();
    var mNodesByKey = new Map();
    var mParentKeys = new Map();
    var mUsedKeys = new Map();
    var aNodes = aRows.map(function (oRow) {
      var sBaseKey = getStableKey(oRow);
      var iDuplicate = mUsedKeys.get(sBaseKey) || 0;
      var sKey = iDuplicate ? sBaseKey + "#" + iDuplicate : sBaseKey;
      var oNode;

      mUsedKeys.set(sBaseKey, iDuplicate + 1);
      oNode = {
        key: sKey,
        objectName: asText(oRow && oRow.ObjectName),
        objectType: asText(oRow && oRow.ObjectType),
        parentObject: asText(oRow && oRow.ParentObject),
        depth: getDepth(oRow),
        lineCount: Number(oRow && oRow.LineCount) || 0,
        icon: getIcon(oRow && oRow.ObjectType),
        originalData: oRow,
        children: []
      };
      mNodesByKey.set(sKey, oNode);
      if (!mNameNodes.has(oNode.objectName)) {
        mNameNodes.set(oNode.objectName, []);
      }
      mNameNodes.get(oNode.objectName).push(oNode);
      return oNode;
    });

    aNodes.forEach(function (oNode) {
      var aCandidates;
      var aDepthMatches;
      var oParent;

      if (oNode.depth === 0 || !oNode.parentObject) {
        mParentKeys.set(oNode.key, null);
        return;
      }

      aCandidates = (mNameNodes.get(oNode.parentObject) || []).filter(function (oCandidate) {
        return oCandidate.key !== oNode.key;
      });
      aDepthMatches = aCandidates.filter(function (oCandidate) {
        return oCandidate.depth + 1 === oNode.depth;
      });

      if (aDepthMatches.length === 1) {
        oParent = aDepthMatches[0];
      } else if (aDepthMatches.length > 1) {
        aWarnings.push("Ambiguous parent for " + oNode.objectName + ": " + oNode.parentObject);
      } else if (aCandidates.length === 1) {
        oParent = aCandidates[0];
        aWarnings.push("Depth mismatch for " + oNode.objectName + " under " + oNode.parentObject);
      } else if (aCandidates.length > 1) {
        aWarnings.push("Duplicate parent name for " + oNode.objectName + ": " + oNode.parentObject);
      } else {
        aWarnings.push("Parent not found for " + oNode.objectName + ": " + oNode.parentObject);
      }

      mParentKeys.set(oNode.key, oParent ? oParent.key : null);
    });

    aNodes.forEach(function (oStartNode) {
      var aPath = [];
      var mPathIndexes = new Map();
      var oCurrent = oStartNode;
      var iCycleStart;
      var aCycle;

      while (oCurrent) {
        if (mPathIndexes.has(oCurrent.key)) {
          iCycleStart = mPathIndexes.get(oCurrent.key);
          aCycle = aPath.slice(iCycleStart);
          aCycle.forEach(function (oCycleNode) {
            mParentKeys.set(oCycleNode.key, null);
          });
          aWarnings.push("Circular source object relationship: " + aCycle.map(function (oNode) {
            return oNode.objectName;
          }).join(" -> "));
          break;
        }
        mPathIndexes.set(oCurrent.key, aPath.length);
        aPath.push(oCurrent);
        oCurrent = mNodesByKey.get(mParentKeys.get(oCurrent.key)) || null;
      }
    });

    var aRoots = [];
    aNodes.forEach(function (oNode) {
      var oParent = mNodesByKey.get(mParentKeys.get(oNode.key));
      if (oParent) {
        oParent.children.push(oNode);
      } else {
        aRoots.push(oNode);
      }
    });

    return {
      roots: aRoots,
      warnings: aWarnings,
      totalCount: aNodes.length
    };
  }

  return {
    build: build,
    getStableKey: getStableKey
  };
});
