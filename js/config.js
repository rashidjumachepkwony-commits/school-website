/**
 * API configuration for the public-facing frontend.
 *
 * When the static HTML files are served from the SAME origin as the backend
 * (e.g. `node server.js` on localhost:5000), relative `/api/...` paths work
 * automatically and `window.__API_BASE_URL__` is left empty.
 *
 * When the frontend is deployed to a SEPARATE static host (e.g. Hosting.com)
 * while the backend runs on Render, set `window.__API_BASE_URL__` to the
 * Render URL BEFORE loading this script:
 *
 *   <script>window.__API_BASE_URL__ = 'https://csa-backend.onrender.com';</script>
 *   <script src="js/config.js"></script>
 *
 * Alternatively, the backend exposes `/api/config` which returns its own
 * `apiBaseUrl`; pages can auto-discover this on first load.
 */
(function () {
  // Allow inline override before this script is loaded.
  var override = window.__API_BASE_URL__ || '';

  if (override && override.trim()) {
    window.__API_BASE_URL__ = override.trim().replace(/\/+$/, '');
  } else {
    window.__API_BASE_URL__ = '';
  }

  /**
   * Build a full API URL from a path.
   * @param {string} path - e.g. "/api/content"
   * @returns {string} absolute or relative URL
   */
  window.apiUrl = function (path) {
    if (!path) return path;
    if (window.__API_BASE_URL__) {
      return window.__API_BASE_URL__ + (path.charAt(0) === '/' ? path : '/' + path);
    }
    return path;
  };

  /**
   * Normalise a relative asset/file URL for the current host split.
   * Uploaded files are served from the backend, so we prefix them with the
   * API base URL when one is configured.
   * @param {string} fileUrl - e.g. "/uploads/assignments/123.pdf"
   * @returns {string} absolute or relative URL
   */
  window.assetUrl = function (fileUrl) {
    if (!fileUrl) return fileUrl;
    if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) return fileUrl;
    if (window.__API_BASE_URL__) {
      return window.__API_BASE_URL__ + (fileUrl.charAt(0) === '/' ? fileUrl : '/' + fileUrl);
    }
    return fileUrl;
  };
})();

// Auto-discover the backend URL from the API when no override is set.
// This allows a static host to detect whether it is being served from the
// same origin as the backend (in which case `/api/config` resolves) or a
// different one (the fetch will fail and we silently fall back).
window._autoDetectApiBase = function () {
  if (window.__API_BASE_URL__) return Promise.resolve();
  return fetch('/api/config')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.success && data.apiBaseUrl) {
        window.__API_BASE_URL__ = data.apiBaseUrl.replace(/\/+$/, '');
      }
    })
    .catch(function () { /* not reachable / same-origin not available */ });
};
