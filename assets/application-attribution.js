(function () {
  'use strict';

  var APPLICATION_ORIGIN = 'https://apply.suttonfunding.com';
  var APPLICATION_PATH = '/apply';
  var LANDING_STORAGE_KEY = 'sf_marketing_landing_path';
  var SOURCE_STORAGE_KEY = 'sf_marketing_source';
  var MEDIUM_STORAGE_KEY = 'sf_marketing_medium';
  var ALLOWED_ATTRIBUTION_SOURCES = new Set([
    'direct', 'google', 'bing', 'duckduckgo', 'yahoo', 'linkedin',
    'facebook', 'instagram', 'meta', 'newsletter', 'email', 'trustpilot',
    'bbb', 'referral', 'bankwithhank',
  ]);
  var ALLOWED_ATTRIBUTION_MEDIA = new Set([
    'none', 'organic', 'cpc', 'ppc', 'paid_search', 'paid-search',
    'paid_social', 'paid-social', 'social', 'email', 'referral', 'display',
    'affiliate', 'sms', 'owned_application',
  ]);
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
    '/editorial-policy/',
    '/corrections-policy/',
    '/authors/henry-gross/',
    '/resources/',
    '/resources/working-capital-vs-line-of-credit/',
    '/resources/term-financing-vs-line-of-credit/',
    '/resources/sba-loans-vs-alternative-business-funding/',
    '/resources/apr-factor-rate-total-cost/',
    '/resources/business-funding-requirements/',
    '/resources/business-funding-document-checklist/',
    '/resources/direct-funder-vs-broker-marketplace/',
  ]);
  var ALLOWED_CTA_LOCATIONS = new Set([
    'nav',
    'mobile_nav',
    'hero',
    'calculator',
    'product',
    'contact',
    'page_bottom',
    'footer',
    'content',
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

  function allowlistedAttributionToken(value, allowlist) {
    var token = String(value || '').trim().toLowerCase();
    return allowlist.has(token) ? token : '';
  }

  function safeCtaLocation(value) {
    var location = String(value || '').trim().toLowerCase();
    return ALLOWED_CTA_LOCATIONS.has(location) ? location : 'content';
  }

  function currentAttribution() {
    var params = new URL(window.location.href).searchParams;
    var source = allowlistedAttributionToken(params.get('utm_source'), ALLOWED_ATTRIBUTION_SOURCES);
    var medium = allowlistedAttributionToken(params.get('utm_medium'), ALLOWED_ATTRIBUTION_MEDIA);

    if (!source || !medium) {
      source = 'direct';
      medium = 'none';
      try {
        var referrer = new URL(document.referrer);
        if (referrer.origin !== window.location.origin) {
          var host = referrer.hostname.toLowerCase().replace(/^www\./, '');
          if (/(^|\.)google\./.test(host)) {
            source = 'google';
            medium = 'organic';
          } else if (/(^|\.)bing\.com$/.test(host)) {
            source = 'bing';
            medium = 'organic';
          } else if (/(^|\.)duckduckgo\.com$/.test(host)) {
            source = 'duckduckgo';
            medium = 'organic';
          } else if (/(^|\.)search\.yahoo\.com$/.test(host)) {
            source = 'yahoo';
            medium = 'organic';
          } else {
            source = 'referral';
            medium = 'referral';
          }
        }
      } catch (error) {}
    }

    return { source: source, medium: medium };
  }

  function getFirstTouchAttribution() {
    try {
      var storedSource = allowlistedAttributionToken(sessionStorage.getItem(SOURCE_STORAGE_KEY), ALLOWED_ATTRIBUTION_SOURCES);
      var storedMedium = allowlistedAttributionToken(sessionStorage.getItem(MEDIUM_STORAGE_KEY), ALLOWED_ATTRIBUTION_MEDIA);
      if (storedSource && storedMedium) {
        return { source: storedSource, medium: storedMedium };
      }
      var attribution = currentAttribution();
      sessionStorage.setItem(SOURCE_STORAGE_KEY, attribution.source);
      sessionStorage.setItem(MEDIUM_STORAGE_KEY, attribution.medium);
      return attribution;
    } catch (error) {
      return currentAttribution();
    }
  }

  function isApplicationLink(link) {
    try {
      var url = new URL(link.href, window.location.href);
      return url.origin === APPLICATION_ORIGIN && url.pathname === APPLICATION_PATH;
    } catch (error) {
      return false;
    }
  }

  function addSafeAttribution(link, landingPath, ctaPath, attribution) {
    var url = new URL(link.href, window.location.href);
    url.searchParams.set('sf_landing', landingPath);
    url.searchParams.set('sf_cta', ctaPath);
    url.searchParams.set('utm_source', attribution.source);
    url.searchParams.set('utm_medium', attribution.medium);
    link.href = url.toString();
  }

  function trackApplicationCta(ctaLocation) {
    if (typeof window.gtag !== 'function') return;
    window.gtag('event', 'application_cta_click', {
      form_name: 'business_funding_application',
      lead_type: 'business_funding',
      cta_location: ctaLocation,
      transport_type: 'beacon',
    });
  }

  function initialize() {
    var landingPath = getLandingPath();
    var ctaPath = safeMarketingPath(window.location.pathname);
    var attribution = getFirstTouchAttribution();
    document.querySelectorAll('a[href]').forEach(function (link) {
      if (!isApplicationLink(link)) return;
      addSafeAttribution(link, landingPath, ctaPath, attribution);
      link.addEventListener('click', function () {
        trackApplicationCta(safeCtaLocation(link.dataset && link.dataset.ctaLocation));
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
