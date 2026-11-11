// App-shell bootstrap, loaded synchronously from <head> before the bundle.
// It lives in a same-origin file rather than inline so the document CSP can
// forbid inline script (script-src 'self'). Served with Cache-Control: no-cache
// because, unlike Vite assets, this path is not content-hashed.
(function () {
  // Resolve the theme before first paint. Mirrors resolveTheme in
  // src/utils/themeSchedule.js; both are checked against
  // tests/fixtures/theme_schedule_cases.json. A legacy 'theme' key is a fixed mode.
  try {
    var timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
    var minutesOf = function (value, fallback) {
      var match = timePattern.exec(typeof value === 'string' ? value : '') || timePattern.exec(fallback);
      return Number(match[1]) * 60 + Number(match[2]);
    };
    var preference = null;
    try { preference = JSON.parse(localStorage.getItem('theme-preference')); } catch { preference = null; }
    if (!preference || typeof preference !== 'object') {
      var legacy = localStorage.getItem('theme');
      preference = legacy === 'light' || legacy === 'dark' ? { mode: legacy } : { mode: 'system' };
    }
    var resolved;
    if (preference.mode === 'light' || preference.mode === 'dark') {
      resolved = preference.mode;
    } else if (preference.mode === 'schedule') {
      var now = new Date();
      var minute = now.getHours() * 60 + now.getMinutes();
      var darkFrom = minutesOf(preference.darkFrom, '20:00');
      var lightFrom = minutesOf(preference.lightFrom, '07:00');
      var dark = darkFrom === lightFrom
        || (darkFrom < lightFrom ? minute >= darkFrom && minute < lightFrom : minute >= darkFrom || minute < lightFrom);
      resolved = dark ? 'dark' : 'light';
    } else {
      resolved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', resolved);
  } catch {
    document.documentElement.setAttribute('data-theme', 'dark');
  }

  // Apply async stylesheets (web fonts) without an inline onload handler.
  document.addEventListener('DOMContentLoaded', function () {
    var links = document.querySelectorAll('link[data-async-stylesheet]');
    for (var index = 0; index < links.length; index += 1) {
      links[index].rel = 'stylesheet';
    }
  });

  // Start fetching public landing examples while the JS bundle is still
  // downloading; src/utils/landingPrefetch.js consumes this promise.
  // Entry-path logic mirrors isLandingEntryPath/isPublicMarketingHost in
  // src/utils/landingPrefetch.js and src/utils/marketingHost.js — keep in sync.
  var host = window.location.hostname;
  var path = window.location.pathname;
  var isMarketingHost = host === 'fractalgoals.com' || host === 'www.fractalgoals.com';
  var isLocalDevHost = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1';
  var isLocalPreviewPath = path === '/landing-preview' && isLocalDevHost;
  var isLandingEntry = isLocalPreviewPath || (path === '/' && isMarketingHost);
  document.documentElement.setAttribute('data-entry-surface', isLandingEntry ? 'landing' : 'app');
  if (!isLandingEntry) return;
  // index.html carries the build-time URL in a meta tag Vite fills in.
  var staticUrlMeta = document.querySelector('meta[name="fg-landing-examples-static-url"]');
  var staticUrl = staticUrlMeta ? staticUrlMeta.getAttribute('content') || '' : '';
  if (!staticUrl || staticUrl.charAt(0) === '%') staticUrl = '';
  if (!isMarketingHost) staticUrl = '';
  window.__fgLandingExamplesStaticUrl = staticUrl;
  var preloadUrl = staticUrl || '/api/public/landing-examples';
  window.__fgLandingExamplesStaticAttempted = Boolean(staticUrl);
  var controller = typeof AbortController === 'function' ? new AbortController() : null;
  var timeoutId = controller ? setTimeout(function () { controller.abort(); }, 2000) : null;
  window.__fgLandingExamplesPreload = fetch(preloadUrl, {
    credentials: staticUrl ? 'omit' : 'same-origin',
    signal: controller ? controller.signal : undefined
  })
    .then(function (response) {
      if (!response.ok) throw new Error('landing examples preload failed: ' + response.status);
      return response.json();
    })
    .then(function (payload) {
      if (!payload || !Array.isArray(payload.examples)) {
        throw new Error('landing examples preload returned an invalid snapshot');
      }
      return payload;
    })
    .finally(function () {
      if (timeoutId) clearTimeout(timeoutId);
    });
  // landingPrefetch falls back to its own request on rejection.
  window.__fgLandingExamplesPreload.catch(function () {});
})();
