import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const script = await readFile(new URL('../assets/application-attribution.js', import.meta.url), 'utf8');

const resourcePaths = [
  '/resources/',
  '/resources/working-capital-vs-line-of-credit/',
  '/resources/term-financing-vs-line-of-credit/',
  '/resources/sba-loans-vs-alternative-business-funding/',
  '/resources/apr-factor-rate-total-cost/',
  '/resources/business-funding-requirements/',
  '/resources/business-funding-document-checklist/',
  '/resources/direct-funder-vs-broker-marketplace/',
];

const trustPaths = [
  '/editorial-policy/',
  '/corrections-policy/',
  '/authors/henry-gross/',
];

function runAtPath(pathname, storedLanding = null, options = {}) {
  const listeners = new Map();
  const link = {
    href: 'https://apply.suttonfunding.com/apply',
    dataset: { ctaLocation: options.ctaLocation || 'content' },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
  };
  const storage = new Map();
  if (storedLanding) storage.set('sf_marketing_landing_path', storedLanding);
  for (const [key, value] of Object.entries(options.storedAttribution || {})) storage.set(key, value);
  const events = [];
  const location = new URL(`https://www.suttonfunding.com${pathname}`);
  const context = {
    URL,
    Set,
    String,
    window: {
      location,
      gtag(...args) {
        events.push(args);
      },
    },
    document: {
      referrer: options.referrer || '',
      readyState: 'complete',
      querySelectorAll(selector) {
        assert.equal(selector, 'a[href]');
        return [link];
      },
      addEventListener() {
        throw new Error('DOMContentLoaded listener should not be needed');
      },
    },
    sessionStorage: {
      getItem(key) {
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
    },
  };
  vm.runInNewContext(script, context);
  return { events, link, listeners, storage };
}

test('every canonical resource path is an allowed landing and CTA page path', () => {
  for (const path of resourcePaths) {
    const { link, listeners, storage, events } = runAtPath(path, null, { ctaLocation: 'page_bottom' });
    const url = new URL(link.href);
    assert.equal(url.searchParams.get('sf_landing'), path);
    assert.equal(url.searchParams.get('sf_cta'), path);
    assert.equal(url.searchParams.get('utm_source'), 'direct');
    assert.equal(url.searchParams.get('utm_medium'), 'none');
    assert.equal(storage.get('sf_marketing_landing_path'), path);

    listeners.get('click')();
    assert.equal(events[0][0], 'event');
    assert.equal(events[0][1], 'application_cta_click');
    assert.equal(events[0][2].form_name, 'business_funding_application');
    assert.equal(events[0][2].lead_type, 'business_funding');
    assert.equal(events[0][2].cta_location, 'page_bottom');
    assert.equal(events[0][2].transport_type, 'beacon');
  }
});

test('every canonical trust path preserves its landing and CTA page path', () => {
  for (const path of trustPaths) {
    const { link, storage } = runAtPath(path, null, { ctaLocation: 'nav' });
    const url = new URL(link.href);
    assert.equal(url.searchParams.get('sf_landing'), path);
    assert.equal(url.searchParams.get('sf_cta'), path);
    assert.equal(storage.get('sf_marketing_landing_path'), path);
  }
});

test('an allowed stored landing survives navigation to another resource', () => {
  const landing = '/resources/';
  const cta = '/resources/business-funding-document-checklist/';
  const { link } = runAtPath(cta, landing);
  const url = new URL(link.href);
  assert.equal(url.searchParams.get('sf_landing'), landing);
  assert.equal(url.searchParams.get('sf_cta'), cta);
});

test('allowlisted source and medium are carried without forwarding raw campaign values', () => {
  const { link } = runAtPath('/resources/?utm_source=google&utm_medium=organic&utm_campaign=august-guide');
  const url = new URL(link.href);
  assert.equal(url.searchParams.get('utm_source'), 'google');
  assert.equal(url.searchParams.get('utm_medium'), 'organic');
  assert.equal(url.searchParams.has('utm_campaign'), false);
});

test('search referrers are reduced to a non-PII source and medium', () => {
  const { link } = runAtPath('/resources/', null, {
    referrer: 'https://www.google.com/search?q=private%40example.com',
  });
  const url = new URL(link.href);
  assert.equal(url.searchParams.get('utm_source'), 'google');
  assert.equal(url.searchParams.get('utm_medium'), 'organic');
  assert.equal(url.searchParams.has('utm_campaign'), false);
});

test('PII-shaped campaign values are rejected', () => {
  const { link } = runAtPath('/resources/?utm_source=private%40example.com&utm_medium=organic%3Femail%3Dprivate&utm_campaign=campaign%23private');
  const url = new URL(link.href);
  assert.equal(url.searchParams.get('utm_source'), 'direct');
  assert.equal(url.searchParams.get('utm_medium'), 'none');
  assert.equal(url.searchParams.has('utm_campaign'), false);
});

test('punctuation-free names and phone-like UTM values never reach the application URL', () => {
  const { link } = runAtPath('/resources/?utm_source=Jane%20Doe&utm_medium=organic&utm_campaign=5551234567');
  const url = new URL(link.href);
  assert.equal(url.searchParams.get('utm_source'), 'direct');
  assert.equal(url.searchParams.get('utm_medium'), 'none');
  assert.equal(url.searchParams.has('utm_campaign'), false);
  assert.doesNotMatch(url.toString(), /Jane|5551234567/);
});

test('unknown paths are reduced to the safe root path', () => {
  const { link, storage } = runAtPath('/not-an-allowed-page/?email=person@example.com');
  const url = new URL(link.href);
  assert.equal(url.searchParams.get('sf_landing'), '/');
  assert.equal(url.searchParams.get('sf_cta'), '/');
  assert.equal(storage.get('sf_marketing_landing_path'), '/');
  assert.deepEqual([...url.searchParams.keys()].sort(), ['sf_cta', 'sf_landing', 'utm_medium', 'utm_source']);
});

test('CTA placement is allowlisted independently from the safe page path', () => {
  const { link, listeners, events } = runAtPath('/working-capital/', null, {
    ctaLocation: 'private-person@example.com',
  });
  listeners.get('click')();
  assert.equal(events[0][2].cta_location, 'content');
  const url = new URL(link.href);
  assert.equal(url.searchParams.get('sf_cta'), '/working-capital/');
  assert.doesNotMatch(url.toString(), /private-person/);
});
