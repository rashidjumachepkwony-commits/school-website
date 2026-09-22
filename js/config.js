/**
 * API configuration for Changara Star Academy.
 *
 * On production, the API backend runs as a Cloudflare Worker.
 * Set window.__API_BASE_URL__ before this script loads to override,
 * or leave empty for relative paths on the same origin (Cloudflare Pages).
 *
 * For Netlify, set window.__API_BASE_URL__ to the Worker URL to proxy API calls.
 */
(function () {
    if (window.__CSA_CONFIG_LOADED__) return;
    window.__CSA_CONFIG_LOADED__ = true;

    var override = window.__API_BASE_URL__;

    if (override && override.trim()) {
        window.__API_BASE_URL__ = override.trim().replace(/\/+$/, '');
    } else {
        window.__API_BASE_URL__ = 'https://csa-api.rashidjumachepkwony.workers.dev';
    }

    window.apiUrl = function (path) {
        if (!path) return path;
        if (window.__API_BASE_URL__) {
            return window.__API_BASE_URL__ + (path.charAt(0) === '/' ? path : '/' + path);
        }
        return path;
    };

    // Intercept fetch calls to relative /api/* paths and route them to the Worker.
    // This centralizes API routing so individual HTML files can use fetch('/api/...')
    // without hard-coding the Worker URL.
    var _origFetch = window.fetch;
    window.fetch = function (input, init) {
        if (typeof input === 'string' && input.startsWith('/api/')) {
            input = window.__API_BASE_URL__ + input;
        }
        return _origFetch(input, init);
    };

    window.assetUrl = function (fileUrl) {
        if (!fileUrl) return fileUrl;
        if (fileUrl.indexOf('http://') === 0 || fileUrl.indexOf('https://') === 0) return fileUrl;
        return fileUrl;
    };
})();
