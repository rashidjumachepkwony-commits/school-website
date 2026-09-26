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

    /**
     * Fetch a JSON API response with a useful error when the request does not
     * actually reach the API.
     *
     * Without this, a request that lands on the static site (which answers any
     * unknown path with the SPA 404 page and HTTP 200) fails with the cryptic
     * "Unexpected token '<', \"<html> <he\"... is not valid JSON".
     */
    window.apiJson = async function (path, options) {
        var url = window.apiUrl(path);
        var opts = options || {};
        var headers = Object.assign({}, opts.headers || {});
        if (opts.body && typeof opts.body === 'string' && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }
        var response;
        try {
            response = await window.fetch(url, Object.assign({}, opts, { headers: headers }));
        } catch (networkErr) {
            throw new Error(
                'Could not reach the API at ' + url + '. ' +
                'Check your connection, or that window.__API_BASE_URL__ is set correctly. ' +
                'Original error: ' + networkErr.message
            );
        }

        var type = response.headers.get('content-type') || '';
        var text = await response.text();

        if (type.indexOf('html') !== -1 || text.trim().charAt(0) === '<') {
            throw new Error(
                'The API did not return JSON (got an HTML page, HTTP ' + response.status + ') for ' + url + '. ' +
                'This usually means the request was served by the static website instead of the API. ' +
                'Hard-reload the page (Ctrl+F5) so js/config.js is not stale.'
            );
        }

        try {
            return JSON.parse(text);
        } catch (parseErr) {
            throw new Error('The API returned an unreadable response for ' + url + ': ' + text.slice(0, 200));
        }
    };
})();
