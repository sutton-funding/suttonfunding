import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://www.suttonfunding.com';
const attributionAsset = '/assets/application-attribution.js?v=919b5be1f117';
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

function fileForUrlPath(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  if (decoded === '/') return path.join(siteRoot, 'index.html');
  if (decoded.endsWith('/')) return path.join(siteRoot, decoded.slice(1), 'index.html');
  return path.join(siteRoot, decoded.slice(1));
}

async function exists(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

async function htmlFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(fullPath));
    if (entry.isFile() && entry.name.endsWith('.html')) files.push(fullPath);
  }
  return files;
}

function canonicalPathForFile(file) {
  const relative = path.relative(siteRoot, file).split(path.sep).join('/');
  if (relative === 'index.html') return '/';
  return `/${relative.replace(/index\.html$/, '')}`;
}

function graphTypes(data) {
  const nodes = Array.isArray(data['@graph']) ? data['@graph'] : [data];
  return new Set(nodes.flatMap((node) => Array.isArray(node['@type']) ? node['@type'] : [node['@type']]).filter(Boolean));
}

test('sitemap lists every canonical resource and every URL maps to a public file', async () => {
  const sitemap = await readFile(path.join(siteRoot, 'sitemap.xml'), 'utf8');
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.equal(new Set(locations).size, locations.length, 'sitemap must not contain duplicate URLs');
  for (const resourcePath of resourcePaths) assert.ok(locations.includes(origin + resourcePath), `missing ${resourcePath}`);
  for (const location of locations) {
    const url = new URL(location);
    assert.equal(url.origin, origin);
    assert.equal(await exists(fileForUrlPath(url.pathname)), true, `${url.pathname} has no public file`);
  }
});

test('resource pages have canonical metadata, dates, organizational authorship and valid JSON-LD', async () => {
  for (const resourcePath of resourcePaths) {
    const file = fileForUrlPath(resourcePath);
    const html = await readFile(file, 'utf8');
    assert.equal((html.match(/<h1\b/g) || []).length, 1, `${resourcePath} must have one h1`);
    assert.match(html, /<title>[^<]+<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]+">/);
    assert.ok(html.includes(`<link rel="canonical" href="${origin}${resourcePath}">`));
    assert.ok(html.includes('G-Y78QWR6HVG'));
    assert.ok(html.includes(attributionAsset));
    assert.ok(html.includes('/assets/resources.css'));

    const schemaBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assert.ok(schemaBlocks.length > 0, `${resourcePath} needs JSON-LD`);
    const schemas = schemaBlocks.map((match) => JSON.parse(match[1]));
    const types = new Set(schemas.flatMap((schema) => [...graphTypes(schema)]));
    assert.ok(types.has('BreadcrumbList'), `${resourcePath} needs BreadcrumbList schema`);

    if (resourcePath === '/resources/') {
      assert.ok(types.has('CollectionPage'));
      assert.ok(types.has('ItemList'));
      assert.ok(html.includes('Maintained by:</strong> Sutton Funding Editorial Team'));
    } else {
      assert.ok(types.has('Article'), `${resourcePath} needs Article schema`);
      const article = schemas.flatMap((schema) => schema['@graph'] ?? [schema]).find((node) => node['@type'] === 'Article');
      assert.equal(article.author.name, 'Sutton Funding Editorial Team');
      assert.equal(article.datePublished, '2026-08-09');
      assert.equal(article.dateModified, '2026-08-09');
      assert.ok(html.includes('<strong>Published:</strong> August 9, 2026'));
      assert.ok(html.includes('<strong>Updated:</strong> August 9, 2026'));
      assert.ok((html.match(/<li><a href="https:\/\//g) || []).length >= 2, `${resourcePath} needs primary-source links`);
    }

    assert.doesNotMatch(html, /\b(guaranteed approval|rates? as low as|same-day funding|funding up to \$)\b/i);
  }
});

test('all internal anchor links resolve, including local fragments', async () => {
  const sitemap = await readFile(path.join(siteRoot, 'sitemap.xml'), 'utf8');
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const cachedHtml = new Map();

  async function readCached(file) {
    if (!cachedHtml.has(file)) cachedHtml.set(file, await readFile(file, 'utf8'));
    return cachedHtml.get(file);
  }

  for (const location of locations) {
    const sourceUrl = new URL(location);
    const sourceFile = fileForUrlPath(sourceUrl.pathname);
    const html = await readCached(sourceFile);
    const hrefs = [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map((match) => match[1]);
    assert.ok(hrefs.includes('/resources/'), `${sourceUrl.pathname} needs a Resources navigation link`);
    for (const href of hrefs) {
      if (/^(mailto:|tel:|javascript:)/i.test(href)) continue;
      const target = new URL(href, sourceUrl);
      if (target.origin !== origin) continue;
      const targetFile = fileForUrlPath(target.pathname);
      assert.equal(await exists(targetFile), true, `${sourceUrl.pathname} links to missing ${target.pathname}`);
      if (target.hash) {
        const fragment = decodeURIComponent(target.hash.slice(1));
        const targetHtml = await readCached(targetFile);
        assert.ok(
          targetHtml.includes(`id="${fragment}"`) || targetHtml.includes(`name="${fragment}"`),
          `${sourceUrl.pathname} links to missing fragment ${target.pathname}#${fragment}`,
        );
      }
    }
  }
});

test('canonical resource paths match their file locations', async () => {
  for (const resourcePath of resourcePaths) {
    const file = fileForUrlPath(resourcePath);
    assert.equal(canonicalPathForFile(file), resourcePath);
  }
});

test('homepage links directly to every resource page', async () => {
  const homepage = await readFile(path.join(siteRoot, 'index.html'), 'utf8');
  const hrefs = new Set([...homepage.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map((match) => match[1]));
  for (const resourcePath of resourcePaths) {
    assert.ok(hrefs.has(resourcePath), `homepage is missing direct link to ${resourcePath}`);
  }
});

test('all public HTML identifies the company only as Sutton Funding', async () => {
  for (const file of await htmlFiles(siteRoot)) {
    const html = await readFile(file, 'utf8');
    assert.doesNotMatch(html, /8\s*CH\s+GEE\s+VENTURES|GEE\s+VENTURES/i, path.relative(siteRoot, file));
  }
});

test('calculator controls cannot submit private values through a native GET', async () => {
  const html = await readFile(path.join(siteRoot, 'resources/apr-factor-rate-total-cost/index.html'), 'utf8');
  assert.ok(html.includes('id="calculateCost" type="button"'));
  assert.ok(html.includes('/assets/cost-calculator.js?v=b7c75f2082ea'));
  assert.doesNotMatch(html, /\bname="(?:fundsReceived|totalRepayment|paymentCount|paymentFrequency)"/);
});

test('every canonical page sends GA query-free location and referrer values', async () => {
  const sitemap = await readFile(path.join(siteRoot, 'sitemap.xml'), 'utf8');
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  for (const location of locations) {
    const url = new URL(location);
    const html = await readFile(fileForUrlPath(url.pathname), 'utf8');
    assert.ok(
      /page_location\s*:\s*window\.location\.origin\s*\+\s*window\.location\.pathname/.test(html),
      `${url.pathname} must override GA page_location without query parameters`,
    );
    assert.ok(
      /page_referrer\s*:\s*document\.referrer\s*\?\s*new URL\(document\.referrer\)\.origin\s*\+\s*new URL\(document\.referrer\)\.pathname\s*:\s*''/.test(html),
      `${url.pathname} must override GA page_referrer without query parameters`,
    );
  }
});

test('IndexNow key file is self-verifying and is not referenced as a secret', async () => {
  const key = '34c18769be02832b374d57c04bac7149';
  const value = (await readFile(path.join(siteRoot, `${key}.txt`), 'utf8')).trim();
  assert.equal(value, key);
  assert.match(value, /^[a-f0-9]{8,128}$/);
});
