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
    this._bExportPollingCancelled = false;
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

  DocumentService.prototype.prepareSelectedExport = function (sAnalysisId, mParameters) {
    var sId = String(sAnalysisId || "").trim();
    var oAction;

    this._validateSelectedExportParameters(mParameters);

    if (!sId) {
      return Promise.reject(new Error("AnalysisId is required for export."));
    }

    oAction = this._oModel.bindContext(
      Constants.entitySet.analyses + "(" + encodeURIComponent(sId) + ")/" + Constants.action.prepareSelectedExportSuffix
    );
    oAction.setParameter("FileFormat", mParameters.fileFormat);
    oAction.setParameter("ExportSection", mParameters.exportSection);
    oAction.setParameter("SelectedFields", this.serializeSelectedFields(mParameters.selectedFields));

    return oAction.execute("$direct").then(function () {
      var oContext = oAction.getBoundContext && oAction.getBoundContext();
      return oContext && oContext.requestObject ? oContext.requestObject() : {};
    });
  };

  DocumentService.prototype.downloadSelectedExport = function (sAnalysisId, mParameters) {
    return this.prepareSelectedExport(sAnalysisId, mParameters).then(function (oResult) {
      if (oResult && oResult.DownloadUrl) {
        return this.downloadUrl(oResult.DownloadUrl, {
          fileName: oResult.FileName,
          mimeType: oResult.MimeType,
          fileFormat: mParameters.fileFormat
        });
      }

      if (oResult && oResult.ExportId) {
        return this.pollExportJob(oResult.ExportId).then(function (oJob) {
          return this.downloadExportJobContent(oJob);
        }.bind(this));
      }

      throw new Error("Export did not return a DownloadUrl or ExportId.");
    }.bind(this));
  };

  DocumentService.prototype.serializeSelectedFields = function (aFieldKeys) {
    return (aFieldKeys || []).join(",");
  };

  DocumentService.prototype.cancelExportPolling = function () {
    this._bExportPollingCancelled = true;
  };

  DocumentService.prototype.pollExportJob = function (sExportId) {
    var iTimeout = this._mOptions.exportTimeoutMs || 60000;
    var iInterval = this._mOptions.exportIntervalMs || 2000;
    var iStarted = Date.now();
    var fnSleep = this._mOptions.sleep || function (iMs) {
      return new Promise(function (resolve) {
        setTimeout(resolve, iMs);
      });
    };

    this._bExportPollingCancelled = false;

    function loop() {
      if (this._bExportPollingCancelled) {
        return Promise.reject(new Error("Export polling was cancelled."));
      }
      if (Date.now() - iStarted > iTimeout) {
        return Promise.reject(new Error("Export is still processing. Please try again later."));
      }
      return this.getExportJob(sExportId).then(function (oJob) {
        var sStatus = String(oJob && oJob.Status || "").toUpperCase();
        if (["READY", "COMPLETED", "SUCCESS"].indexOf(sStatus) !== -1) {
          return oJob;
        }
        if (["FAILED", "ERROR"].indexOf(sStatus) !== -1) {
          throw new Error(oJob.Message || "Export failed.");
        }
        return fnSleep(iInterval).then(loop.bind(this));
      }.bind(this));
    }

    return loop.call(this);
  };

  DocumentService.prototype.getExportJob = function (sExportId) {
    var sId = String(sExportId || "").trim();
    if (!sId) {
      return Promise.reject(new Error("ExportId is required."));
    }
    return this._oModel.bindContext(Constants.entitySet.exportJobs + "(" + encodeURIComponent(sId) + ")", undefined, {
      $select: "ExportId,AnalysisId,FileFormat,ExportSection,SelectedFields,Status,FileName,MimeType,Message,CreatedBy,CreatedAt,ExpiresAt",
      $$groupId: "$direct"
    }).requestObject();
  };

  DocumentService.prototype.downloadExportJobContent = function (oJob) {
    var sExportId = oJob && oJob.ExportId;
    if (oJob && oJob.ExpiresAt && new Date(oJob.ExpiresAt).getTime() < Date.now()) {
      return Promise.reject(new Error("The export file has expired."));
    }
    return this.downloadUrl(this._buildAbsoluteServicePath(Constants.entitySet.exportJobs + "(" + encodeURIComponent(sExportId) + ")/Content"), {
      fileName: oJob && oJob.FileName,
      mimeType: oJob && oJob.MimeType,
      fileFormat: oJob && oJob.FileFormat
    });
  };

  DocumentService.prototype.downloadUrl = function (sUrl, mOptions) {
    var fnFetch = this._mOptions.fetch || window.fetch.bind(window);
    var sFileFormat = mOptions && mOptions.fileFormat;

    return fnFetch(sUrl, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: mOptions && mOptions.mimeType || this.getFallbackMimeType(sFileFormat) || "*/*"
      }
    }).then(function (oResponse) {
      if (!oResponse.ok) {
        return this._readErrorResponse(oResponse).then(function (sMessage) {
          throw new Error(sMessage);
        });
      }
      return oResponse.blob().then(function (oBlob) {
        var sMimeType = mOptions && mOptions.mimeType || oResponse.headers && oResponse.headers.get("Content-Type") || this.getFallbackMimeType(sFileFormat);
        var sFileName = mOptions && mOptions.fileName || this._getFileNameFromContentDisposition(oResponse.headers && oResponse.headers.get("Content-Disposition")) || "export";
        var oDownloadBlob = sMimeType && oBlob.type !== sMimeType ? oBlob.slice(0, oBlob.size, sMimeType) : oBlob;

        if (!oDownloadBlob || oDownloadBlob.size === 0) {
          throw new Error("The export response is empty.");
        }

        this._triggerDownload(oDownloadBlob, this.sanitizeFileName(sFileName));
        return {
          fileName: this.sanitizeFileName(sFileName),
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

  DocumentService.prototype._validateSelectedExportParameters = function (mParameters) {
    this._validateExportParameters(Object.assign({
      reportType: "selected-export"
    }, mParameters || {}));

    if (String(mParameters.fileFormat || "").length > 1) {
      throw new Error("FileFormat must not exceed 1 character.");
    }

    if (String(mParameters.exportSection || "").length > 20) {
      throw new Error("ExportSection must not exceed 20 characters.");
    }

    if (!Array.isArray(mParameters.selectedFields) || mParameters.selectedFields.length === 0) {
      throw new Error("Select at least one column to export.");
    }
  };

  DocumentService.prototype._buildAbsoluteServicePath = function (sPath) {
    var sServiceUrl = this._getServiceRoot();
    var iQueryIndex = sServiceUrl.indexOf("?");
    var sBase = iQueryIndex === -1 ? sServiceUrl : sServiceUrl.slice(0, iQueryIndex);
    var sQuery = iQueryIndex === -1 ? "" : sServiceUrl.slice(iQueryIndex + 1);
    var sUrl = sBase.replace(/\/$/, "") + "/" + String(sPath || "").replace(/^\//, "");

    return sQuery ? sUrl + "?" + sQuery : sUrl;
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
