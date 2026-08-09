(function () {
  'use strict';

  var APPLICATION_ORIGIN = 'https://apply.suttonfunding.com';
  var APPLICATION_PATH = '/apply';
  var LANDING_STORAGE_KEY = 'sf_marketing_landing_path';
  var ALLOWED_MARKETING_PATHS = new Set([
    '/',
    '/working-capital/',
    '/term-loans/',
    '/business-line-of-credit/',
    '/how-it-works/',
    '/about/',
    '/contact/',
    '/disclosures/',
    '/terms/',
    '/privacy-policy/',
  ]);

  function safeMarketingPath(value) {
    var path = String(value || '');
    if (path === '/index.html') return '/';
    return ALLOWED_MARKETING_PATHS.has(path) ? path : '/';
  }

  function getLandingPath() {
    var currentPath = safeMarketingPath(window.location.pathname);
    try {
      var storedPath = sessionStorage.getItem(LANDING_STORAGE_KEY);
      if (storedPath && ALLOWED_MARKETING_PATHS.has(storedPath)) return storedPath;
      sessionStorage.setItem(LANDING_STORAGE_KEY, currentPath);
    } catch (error) {}
    return currentPath;
  }

  function isApplicationLink(link) {
    try {
      var url = new URL(link.href, window.location.href);
      return url.origin === APPLICATION_ORIGIN && url.pathname === APPLICATION_PATH;
    } catch (error) {
      return false;
    }
  }

  function addSafeAttribution(link, landingPath, ctaPath) {
    var url = new URL(link.href, window.location.href);
    url.searchParams.set('sf_landing', landingPath);
    url.searchParams.set('sf_cta', ctaPath);
    link.href = url.toString();
  }

  function trackApplicationCta(ctaPath) {
    if (typeof window.gtag !== 'function') return;
    window.gtag('event', 'application_cta_click', {
      form_name: 'business_funding_application',
      lead_type: 'business_funding',
      cta_location: ctaPath,
      transport_type: 'beacon',
    });
  }

  function initialize() {
    var landingPath = getLandingPath();
    var ctaPath = safeMarketingPath(window.location.pathname);
    document.querySelectorAll('a[href]').forEach(function (link) {
      if (!isApplicationLink(link)) return;
      addSafeAttribution(link, landingPath, ctaPath);
      link.addEventListener('click', function () {
        trackApplicationCta(ctaPath);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
