/**
 * API configuration for Changara Star Academy.
 *
 * On Cloudflare Pages, all /api/* routes are handled by Pages Functions
 * on the SAME origin. Relative paths work automatically.
 *
 * window.__API_BASE_URL__ is left empty unless an inline override is
 * provided before this script loads.
 */
(function () {
    if (window.__CSA_CONFIG_LOADED__) return;
    window.__CSA_CONFIG_LOADED__ = true;

    var override = window.__API_BASE_URL__;

    if (override && override.trim()) {
        window.__API_BASE_URL__ = override.trim().replace(/\/+$/, '');
    } else {
        window.__API_BASE_URL__ = '';
    }

    window.apiUrl = function (path) {
        if (!path) return path;
        if (window.__API_BASE_URL__) {
            return window.__API_BASE_URL__ + (path.charAt(0) === '/' ? path : '/' + path);
        }
        return path;
    };

    window.assetUrl = function (fileUrl) {
        if (!fileUrl) return fileUrl;
        if (fileUrl.indexOf('http://') === 0 || fileUrl.indexOf('https://') === 0) return fileUrl;
        return fileUrl;
    };
})();
