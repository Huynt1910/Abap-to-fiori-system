sap.ui.define([
  "abap/to/fiori/system/util/Constants"
], function (Constants) {
  "use strict";

  var MIME_TYPES = Object.freeze({
    X: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    P: "application/pdf",
    C: "text/csv;charset=utf-8"
  });

  var EXTENSIONS = Object.freeze({
    X: "xlsx",
    P: "pdf",
    C: "csv"
  });

  function DocumentService(oODataModel, mOptions) {
    this._oModel = oODataModel;
    this._mOptions = mOptions || {};
  }

  DocumentService.prototype.buildExportPath = function (mParameters) {
    this._validateExportParameters(mParameters);

    return Constants.entitySet.exportResult +
      "(ReportType='" + this.escapeODataString(mParameters.reportType) +
      "',FileFormat='" + mParameters.fileFormat +
      "',ExportSection='" + mParameters.exportSection + "')/Content";
  };

  DocumentService.prototype.getExportMetadata = function (sFileFormat) {
    return {
      mimeType: this.getFallbackMimeType(sFileFormat),
      extension: EXTENSIONS[sFileFormat]
    };
  };

  DocumentService.prototype.downloadExport = function (mParameters) {
    var sFileFormat = mParameters && mParameters.fileFormat;
    var sUrl;
    var fnFetch;

    try {
      sUrl = this._buildAbsoluteExportUrl(mParameters);
    } catch (oValidationError) {
      return Promise.reject(oValidationError);
    }

    fnFetch = this._mOptions.fetch || window.fetch.bind(window);

    return fnFetch(sUrl, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: this.getFallbackMimeType(sFileFormat) || "*/*"
      }
    }).then(function (oResponse) {
      if (!oResponse.ok) {
        return this._readErrorResponse(oResponse).then(function (sMessage) {
          throw new Error(sMessage);
        });
      }

      return oResponse.blob().then(function (oBlob) {
        var sContentType = oResponse.headers && oResponse.headers.get("Content-Type");
        var sContentDisposition = oResponse.headers && oResponse.headers.get("Content-Disposition");
        var sMimeType = sContentType || this.getFallbackMimeType(sFileFormat);
        var sFileName = this._getFileNameFromContentDisposition(sContentDisposition) ||
          this.getFallbackFileName(mParameters);
        var oDownloadBlob = sMimeType && oBlob.type !== sMimeType ? oBlob.slice(0, oBlob.size, sMimeType) : oBlob;

        if (!oDownloadBlob || oDownloadBlob.size === 0) {
          throw new Error("The export response is empty.");
        }

        this._triggerDownload(oDownloadBlob, sFileName);
        return {
          fileName: sFileName,
          mimeType: sMimeType,
          url: sUrl
        };
      }.bind(this));
    }.bind(this));
  };

  DocumentService.prototype.getFallbackFileName = function (mParameters) {
    var sReportType = this.sanitizeFileName(mParameters.reportType || "report");
    var sSection = this.sanitizeFileName(mParameters.exportSection || Constants.exportSection.all);
    var sExtension = EXTENSIONS[mParameters.fileFormat] || "bin";
    var oDate = this._mOptions.now ? this._mOptions.now() : new Date();
    var sTimestamp = this._formatTimestamp(oDate);

    return sReportType + "_" + sSection + "_" + sTimestamp + "." + sExtension;
  };

  DocumentService.prototype.getFallbackMimeType = function (sFileFormat) {
    return MIME_TYPES[sFileFormat] || "";
  };

  DocumentService.prototype.sanitizeFileName = function (sValue) {
    return String(sValue || "").replace(/[\/\\:*?"<>|]/g, "_").trim() || "report";
  };

  DocumentService.prototype.escapeODataString = function (sValue) {
    return String(sValue || "").replace(/'/g, "''");
  };

  DocumentService.prototype._validateExportParameters = function (mParameters) {
    var aFormats = Object.keys(Constants.fileFormat).map(function (sKey) {
      return Constants.fileFormat[sKey];
    });
    var aSections = Object.keys(Constants.exportSection).map(function (sKey) {
      return Constants.exportSection[sKey];
    });

    if (!mParameters || !String(mParameters.reportType || "").trim()) {
      throw new Error("Program name is required for export.");
    }

    if (aFormats.indexOf(mParameters.fileFormat) === -1) {
      throw new Error("Unsupported export file format.");
    }

    if (aSections.indexOf(mParameters.exportSection) === -1) {
      throw new Error("Unsupported export section.");
    }
  };

  DocumentService.prototype._buildAbsoluteExportUrl = function (mParameters) {
    var sServiceUrl = this._getServiceRoot();
    var sPath = this.buildExportPath(mParameters);
    var iQueryIndex = sServiceUrl.indexOf("?");
    var sBase = iQueryIndex === -1 ? sServiceUrl : sServiceUrl.slice(0, iQueryIndex);
    var sQuery = iQueryIndex === -1 ? "" : sServiceUrl.slice(iQueryIndex + 1);
    var sUrl = sBase.replace(/\/$/, "") + "/" + sPath.replace(/^\//, "");

    if (sQuery && sQuery.indexOf("sap-client=") !== -1) {
      return sUrl + "?" + sQuery;
    }

    if (sQuery) {
      return sUrl + "?" + sQuery + "&sap-client=" + encodeURIComponent(Constants.service.sapClient);
    }

    return sUrl + "?sap-client=" + encodeURIComponent(Constants.service.sapClient);
  };

  DocumentService.prototype._getServiceRoot = function () {
    if (this._oModel && typeof this._oModel.getServiceUrl === "function") {
      return this._oModel.getServiceUrl();
    }

    return Constants.service.root;
  };

  DocumentService.prototype._readErrorResponse = function (oResponse) {
    return oResponse.text().then(function (sText) {
      var sStatus = oResponse.status ? "HTTP " + oResponse.status : "HTTP error";
      var sMessage = sText;
      var oError;

      try {
        oError = JSON.parse(sText);
        sMessage = oError && oError.error && (
          oError.error.message && (oError.error.message.value || oError.error.message) ||
          oError.error.code
        );
      } catch (oParseError) {
        sMessage = sText;
      }

      return sMessage ? sStatus + ": " + sMessage : sStatus + ": Export failed.";
    });
  };

  DocumentService.prototype._getFileNameFromContentDisposition = function (sHeader) {
    var aMatch;
    var sFileName;

    if (!sHeader) {
      return "";
    }

    aMatch = /filename\*=UTF-8''([^;]+)/i.exec(sHeader);
    if (aMatch) {
      return this.sanitizeFileName(decodeURIComponent(aMatch[1]));
    }

    aMatch = /filename="?([^";]+)"?/i.exec(sHeader);
    sFileName = aMatch && aMatch[1];
    return sFileName ? this.sanitizeFileName(sFileName) : "";
  };

  DocumentService.prototype._triggerDownload = function (oBlob, sFileName) {
    var oUrlApi = this._mOptions.URL || window.URL;
    var oDocument = this._mOptions.document || window.document;
    var sObjectUrl = oUrlApi.createObjectURL(oBlob);
    var oAnchor = oDocument.createElement("a");

    try {
      oAnchor.href = sObjectUrl;
      oAnchor.download = sFileName;
      oAnchor.style.display = "none";
      oDocument.body.appendChild(oAnchor);
      oAnchor.click();
      oDocument.body.removeChild(oAnchor);
    } finally {
      oUrlApi.revokeObjectURL(sObjectUrl);
    }
  };

  DocumentService.prototype._formatTimestamp = function (oDate) {
    function pad(iValue) {
      return String(iValue).padStart(2, "0");
    }

    return oDate.getFullYear() +
      pad(oDate.getMonth() + 1) +
      pad(oDate.getDate()) + "_" +
      pad(oDate.getHours()) +
      pad(oDate.getMinutes()) +
      pad(oDate.getSeconds());
  };

  return DocumentService;
});
