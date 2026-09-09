sap.ui.define([], function () {
  "use strict";

  var _sAuthHeader = null;

  function _buildBasicAuthHeader(sUsername, sPassword) {
    return "Basic " + btoa(sUsername + ":" + sPassword);
  }

  return {
    /**
     * Validates SAP S40 credentials against a real OData call.
     * Only the resulting Authorization header is kept in memory
     * for this browser tab; the raw password is never stored.
     * @param {string} sUsername
     * @param {string} sPassword
     * @param {string} sServiceUrl - root OData service document URL
     * @returns {Promise<boolean>}
     */
    login: function (sUsername, sPassword, sServiceUrl) {
      var sHeader = _buildBasicAuthHeader(sUsername, sPassword);

      return fetch(sServiceUrl, {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: sHeader,
          Accept: "application/json",
          "Cache-Control": "no-cache"
        },
      })
        .then(function (oResponse) {
          if (oResponse.ok) {
            _sAuthHeader = sHeader;
            return true;
          }
          _sAuthHeader = null;
          return false;
        })
        .catch(function () {
          _sAuthHeader = null;
          return false;
        });
    },

    getAuthHeader: function () {
      return _sAuthHeader;
    },

    isLoggedIn: function () {
      return !!_sAuthHeader;
    },

    logout: function () {
      _sAuthHeader = null;
    },
  };
});
