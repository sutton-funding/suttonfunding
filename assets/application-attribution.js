(function () {
  'use strict';

  var APPLICATION_ORIGIN = 'https://apply.suttonfunding.com';
  var APPLICATION_PATH = '/apply';
  var LANDING_STORAGE_KEY = 'sf_marketing_landing_path';
  var SOURCE_STORAGE_KEY = 'sf_marketing_source';
  var MEDIUM_STORAGE_KEY = 'sf_marketing_medium';
  var CAMPAIGN_STORAGE_KEY = 'sf_marketing_campaign';
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
    '/resources/',
    '/resources/working-capital-vs-line-of-credit/',
    '/resources/term-financing-vs-line-of-credit/',
    '/resources/sba-loans-vs-alternative-business-funding/',
    '/resources/apr-factor-rate-total-cost/',
    '/resources/business-funding-requirements/',
    '/resources/business-funding-document-checklist/',
    '/resources/direct-funder-vs-broker-marketplace/',
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

  function safeAttributionToken(value, maxLength) {
    var token = String(value || '').trim();
    if (!token || token.length > maxLength) return '';
    return /^[A-Za-z0-9][A-Za-z0-9._+\-/ ]*$/.test(token) ? token : '';
  }

  function currentAttribution() {
    var params = new URL(window.location.href).searchParams;
    var source = safeAttributionToken(params.get('utm_source'), 80);
    var medium = safeAttributionToken(params.get('utm_medium'), 80);
    var campaign = safeAttributionToken(params.get('utm_campaign'), 120);

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
            source = safeAttributionToken(host, 80) || 'referral';
            medium = 'referral';
          }
        }
      } catch (error) {}
    }

    return { source: source, medium: medium, campaign: campaign };
  }

  function getFirstTouchAttribution() {
    try {
      var storedSource = safeAttributionToken(sessionStorage.getItem(SOURCE_STORAGE_KEY), 80);
      var storedMedium = safeAttributionToken(sessionStorage.getItem(MEDIUM_STORAGE_KEY), 80);
      var storedCampaign = safeAttributionToken(sessionStorage.getItem(CAMPAIGN_STORAGE_KEY), 120);
      if (storedSource && storedMedium) {
        return { source: storedSource, medium: storedMedium, campaign: storedCampaign };
      }
      var attribution = currentAttribution();
      sessionStorage.setItem(SOURCE_STORAGE_KEY, attribution.source);
      sessionStorage.setItem(MEDIUM_STORAGE_KEY, attribution.medium);
      if (attribution.campaign) sessionStorage.setItem(CAMPAIGN_STORAGE_KEY, attribution.campaign);
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
    if (attribution.campaign) url.searchParams.set('utm_campaign', attribution.campaign);
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
    var attribution = getFirstTouchAttribution();
    document.querySelectorAll('a[href]').forEach(function (link) {
      if (!isApplicationLink(link)) return;
      addSafeAttribution(link, landingPath, ctaPath, attribution);
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
