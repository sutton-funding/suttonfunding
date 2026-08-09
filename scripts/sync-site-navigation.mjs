import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const attributionScript = '/assets/application-attribution.js?v=3e0e44411693';
const navigationCss = '/assets/site-navigation.css?v=9582638005a9';
const navigationScript = '/assets/site-navigation.js?v=277a68ef2c82';

const sitemap = await readFile(path.join(siteRoot, 'sitemap.xml'), 'utf8');
const canonicalFiles = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => {
  const pathname = new URL(match[1]).pathname;
  return pathname === '/' ? 'index.html' : `${pathname.replace(/^\//, '')}index.html`;
});

const contentCtaLocations = new Map([
  ['index.html', ['hero', 'calculator']],
  ['working-capital/index.html', ['hero', 'page_bottom']],
  ['term-loans/index.html', ['hero', 'page_bottom']],
  ['business-line-of-credit/index.html', ['hero', 'page_bottom']],
  ['how-it-works/index.html', ['page_bottom']],
  ['about/index.html', []],
  ['contact/index.html', ['contact']],
  ['disclosures/index.html', []],
  ['terms/index.html', []],
  ['privacy-policy/index.html', []],
  ['resources/index.html', ['page_bottom']],
  ['resources/working-capital-vs-line-of-credit/index.html', ['page_bottom']],
  ['resources/term-financing-vs-line-of-credit/index.html', ['page_bottom']],
  ['resources/sba-loans-vs-alternative-business-funding/index.html', ['page_bottom']],
  ['resources/apr-factor-rate-total-cost/index.html', []],
  ['resources/business-funding-requirements/index.html', []],
  ['resources/business-funding-document-checklist/index.html', []],
  ['resources/direct-funder-vs-broker-marketplace/index.html', []],
]);

function headerMarkup(isHomepage) {
  return `<!-- SITE NAVIGATION START -->
  <a class="sf-skip-link" href="#main-content">Skip to main content</a>
  <header id="navbar" class="sf-header${isHomepage ? ' sf-header--home' : ''}" data-site-header>
    <nav class="sf-nav" aria-label="Primary navigation">
      <a href="/" class="sf-brand" aria-label="Sutton Funding home">
        <span class="sf-brand-mark"><img src="/assets/sutton-mark.webp" srcset="/assets/sutton-mark-96.webp 96w, /assets/sutton-mark.webp 384w" sizes="48px" alt="" width="384" height="256"></span>
        <span class="sf-brand-name">Sutton Funding</span>
      </a>
      <!-- Desktop Primary Links -->
      <div class="sf-nav-primary">
        <a href="/#products">Funding Options</a>
        <a href="/resources/apr-factor-rate-total-cost/#calculator">Calculator</a>
        <a href="/resources/">Resources</a>
        <a href="/about/">Why Sutton?</a>
      </div>
      <!-- Desktop Actions -->
      <div class="sf-nav-actions">
        <span class="sf-nav-divider" aria-hidden="true"></span>
        <a href="https://suttonfunding.app/login">Login</a>
        <a href="https://apply.suttonfunding.com/apply" class="sf-nav-apply" data-cta-location="nav">Apply Now</a>
      </div>
      <button class="sf-menu-toggle" type="button" aria-label="Open navigation menu" aria-controls="site-mobile-menu" aria-expanded="false" data-menu-toggle>
        <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="/assets/icons.svg#menu"></use></svg>
      </button>
    </nav>
  </header>
  <div id="site-mobile-menu" class="sf-mobile-menu" role="dialog" aria-modal="true" aria-label="Navigation menu" aria-hidden="true" inert data-mobile-menu>
    <button class="sf-menu-close" type="button" aria-label="Close navigation menu" data-menu-close>
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="/assets/icons.svg#x"></use></svg>
    </button>
    <nav class="sf-mobile-links" aria-label="Mobile navigation">
      <a href="/#products">Funding Options</a>
      <a href="/resources/apr-factor-rate-total-cost/#calculator">Calculator</a>
      <a href="/resources/">Resources</a>
      <a href="/about/">Why Sutton?</a>
      <hr>
      <a href="https://suttonfunding.app/login">Portal Login</a>
      <a href="https://apply.suttonfunding.com/apply" class="sf-mobile-apply" data-cta-location="mobile_nav">Apply Now</a>
    </nav>
  </div>
  <!-- SITE NAVIGATION END -->`;
}

function addAssets(html) {
  html = html.replace(/\n?\s*<link rel="stylesheet" href="\/assets\/site-navigation\.css\?v=[^"]+">/g, '');
  html = html.replace(/\n?\s*<script defer src="\/assets\/site-navigation\.js\?v=[^"]+"><\/script>/g, '');
  const attribution = /<script defer src="\/assets\/application-attribution\.js\?v=[^"]+"><\/script>/;
  if (!attribution.test(html)) throw new Error('Missing attribution asset');
  return html.replace(attribution, `<link rel="stylesheet" href="${navigationCss}">\n  <script defer src="${attributionScript}"></script>\n  <script defer src="${navigationScript}"></script>`);
}

function replaceNavigation(html, isHomepage) {
  const replacement = headerMarkup(isHomepage);
  if (html.includes('<!-- SITE NAVIGATION START -->')) {
    return html.replace(/<!-- SITE NAVIGATION START -->[\s\S]*?<!-- SITE NAVIGATION END -->/, replacement);
  }
  if (isHomepage) {
    const start = html.indexOf('    <!-- NAVIGATION -->');
    const end = html.indexOf('    <main>', start);
    if (start < 0 || end < 0) throw new Error('Homepage navigation boundary not found');
    return html.slice(0, start) + '  ' + replacement + '\n\n' + html.slice(end);
  }
  const bodyStart = html.indexOf('<body');
  const headerStart = html.indexOf('<header', bodyStart);
  const mainStart = html.indexOf('<main', headerStart);
  const headerEnd = html.lastIndexOf('</header>', mainStart);
  if (bodyStart < 0 || headerStart < 0 || headerEnd < headerStart || mainStart < headerEnd) {
    throw new Error('Interior-page navigation boundary not found');
  }
  return html.slice(0, headerStart) + replacement + '\n\n  ' + html.slice(mainStart);
}

function identifyMain(html) {
  return html.replace(/<main(?![^>]*\bid=)([^>]*)>/, '<main id="main-content" tabindex="-1"$1>');
}

function decorateContentCtas(html, relativeFile) {
  const locations = [...(contentCtaLocations.get(relativeFile) ?? [])];
  let index = 0;
  html = html.replace(/<a\b([^>]*href="https:\/\/apply\.suttonfunding\.com\/apply"[^>]*)>/g, (match, attributes) => {
    if (/\bdata-cta-location="(?:nav|mobile_nav)"/.test(attributes)) return match;
    const location = locations[index++];
    if (!location) throw new Error(`Unexpected application CTA in ${relativeFile}`);
    attributes = attributes.replace(/\s+data-cta-location="[^"]+"/, '');
    return `<a${attributes} data-cta-location="${location}">`;
  });
  if (index !== locations.length) {
    throw new Error(`Expected ${locations.length} content CTAs in ${relativeFile}, decorated ${index}`);
  }
  return html
    .replace(/Check Eligibility/g, 'Start Application')
    .replace(/Start an Application/g, 'Start Application')
    .replace(/Apply for Business Funding/g, 'Start Application')
    .replace(/Explore Options/g, 'Start Application')
    .replace(/Get Funded/g, 'Start Application');
}

for (const relativeFile of canonicalFiles) {
  const file = path.join(siteRoot, relativeFile);
  let html = await readFile(file, 'utf8');
  html = addAssets(html);
  html = replaceNavigation(html, relativeFile === 'index.html');
  html = identifyMain(html);
  html = decorateContentCtas(html, relativeFile);
  await writeFile(file, html);
}

console.log(`Synchronized navigation across ${canonicalFiles.length} canonical pages.`);
