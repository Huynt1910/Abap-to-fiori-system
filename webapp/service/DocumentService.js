sap.ui.define([
  "abap/to/fiori/system/util/Constants"
], function (Constants) {
  "use strict";

  function DocumentService(oODataModel) {
    this._oModel = oODataModel;
  }

  /**
   * Reads document metadata for one analysis.
   * @param {string} sAnalysisId Analysis GUID.
   * @returns {Promise<object|null>} Document metadata.
   */
  DocumentService.prototype.getDocumentMetadata = function (sAnalysisId) {
    return this._readContext(this._buildAnalysisPath(sAnalysisId) + "/" + Constants.association.document).catch(function (oError) {
      if (oError && oError.status === 404) {
        return null;
      }
      throw oError;
    });
  };

  /**
   * Executes the instance-bound GenerateDocument action.
   * @param {string} sAnalysisId Analysis GUID.
   * @returns {Promise<object>} Action result.
   */
  DocumentService.prototype.generateDocument = function (sAnalysisId) {
    var oActionBinding = this._oModel.bindContext(
      this._buildAnalysisPath(sAnalysisId) + "/" + Constants.action.generateDocument + "(...)"
    );
    return oActionBinding.execute().then(function () {
      var oContext = oActionBinding.getBoundContext();
      return oContext ? oContext.requestObject() : {};
    });
  };

  /**
   * Returns the service-root relative stream URL for document download.
   * @param {string} sAnalysisId Analysis GUID.
   * @returns {string} Relative stream URL.
   */
  DocumentService.prototype.getDownloadUrl = function (sAnalysisId) {
    return this._joinUrl(
      this._getServiceRoot(),
      this._buildAnalysisPath(sAnalysisId) + "/" + Constants.association.document + "/Attachment"
    );
  };

  /**
   * Opens the document stream in the browser.
   * @param {string} sAnalysisId Analysis GUID.
   * @returns {Promise<void>} Resolved after opening the stream URL.
   */
  DocumentService.prototype.downloadDocument = function (sAnalysisId) {
    window.open(this.getDownloadUrl(sAnalysisId), "_blank", "noopener");
    return Promise.resolve();
  };

  DocumentService.prototype._readContext = function (sPath) {
    return this._oModel.bindContext(sPath).requestObject();
  };

  DocumentService.prototype._buildAnalysisPath = function (sAnalysisId) {
    var sId = String(sAnalysisId || "").trim();

    if (!sId) {
      throw new Error("AnalysisId is required.");
    }

    return Constants.entitySet.analysis + "(" + encodeURIComponent(sId) + ")";
  };

  DocumentService.prototype._getServiceRoot = function () {
    if (this._oModel && typeof this._oModel.getServiceUrl === "function") {
      return this._oModel.getServiceUrl();
    }

    return "";
  };

  DocumentService.prototype._joinUrl = function (sBaseUrl, sPath) {
    var sBase = String(sBaseUrl || "").replace(/\/$/, "");
    var sRelativePath = String(sPath || "").replace(/^\//, "");

    return sBase ? sBase + "/" + sRelativePath : "/" + sRelativePath;
  };

  return DocumentService;
});
