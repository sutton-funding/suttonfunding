import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://www.suttonfunding.com';
const attributionAsset = '/assets/application-attribution.js?v=3e0e44411693';
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

test('sitemap lists every canonical resource and trust page, and every URL maps to a public file', async () => {
  const sitemap = await readFile(path.join(siteRoot, 'sitemap.xml'), 'utf8');
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.equal(new Set(locations).size, locations.length, 'sitemap must not contain duplicate URLs');
  for (const resourcePath of resourcePaths) assert.ok(locations.includes(origin + resourcePath), `missing ${resourcePath}`);
  for (const trustPath of trustPaths) assert.ok(locations.includes(origin + trustPath));
  for (const location of locations) {
    const url = new URL(location);
    assert.equal(url.origin, origin);
    assert.equal(await exists(fileForUrlPath(url.pathname)), true, `${url.pathname} has no public file`);
  }
});

test('resource pages have canonical metadata, dates, named authorship and valid JSON-LD', async () => {
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
      assert.ok(html.includes('Maintained by:</strong> <a href="/authors/henry-gross/">Henry Gross, CEO</a>'));
      assert.ok(html.includes('/editorial-policy/'));
      assert.ok(html.includes('/corrections-policy/'));
    } else {
      assert.ok(types.has('Article'), `${resourcePath} needs Article schema`);
      const article = schemas.flatMap((schema) => schema['@graph'] ?? [schema]).find((node) => node['@type'] === 'Article');
      assert.equal(article.author['@type'], 'Person');
      assert.equal(article.author.name, 'Henry Gross');
      assert.equal(article.author.url, origin + '/authors/henry-gross/');
      assert.equal(article.datePublished, '2026-08-09');
      assert.equal(article.dateModified, '2026-08-09');
      assert.ok(html.includes('<strong>By:</strong> <a href="/authors/henry-gross/">Henry Gross, CEO</a>'));
      assert.ok(html.includes('<strong>Published:</strong> August 9, 2026'));
      assert.ok(html.includes('<strong>Updated:</strong> August 9, 2026'));
      assert.ok(html.includes('General educational content reviewed under our <a href="/editorial-policy/">editorial policy</a>'));
      assert.ok((html.match(/<li><a href="https:\/\//g) || []).length >= 2, `${resourcePath} needs primary-source links`);
    }

    assert.doesNotMatch(html, /Sutton Funding Editorial Team/);
    assert.doesNotMatch(html, /\b(guaranteed approval|rates? as low as|same-day funding|funding up to \$)\b/i);
  }
});

test('Henry Gross author profile is limited to verified identity and role facts', async () => {
  const html = await readFile(fileForUrlPath('/authors/henry-gross/'), 'utf8');
  assert.ok(html.includes('<h1 class="resource-title">Henry Gross</h1>'));
  assert.ok(html.includes('<p class="resource-deck">CEO, Sutton Funding</p>'));
  assert.doesNotMatch(html, /\b(years? of experience|expert|licensed|certified|credential|graduated|linkedin|headshot)\b/i);

  const schemaBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  const nodes = schemaBlocks.flatMap((match) => {
    const schema = JSON.parse(match[1]);
    return schema['@graph'] ?? [schema];
  });
  const profile = nodes.find((node) => node['@type'] === 'ProfilePage');
  const person = nodes.find((node) => node['@type'] === 'Person');
  assert.ok(profile);
  assert.ok(person);
  assert.deepEqual(
    Object.keys(person).sort(),
    ['@id', '@type', 'jobTitle', 'name', 'worksFor'].sort(),
  );
  assert.equal(person.name, 'Henry Gross');
  assert.equal(person.jobTitle, 'CEO');
  assert.equal(person.worksFor.name, 'Sutton Funding');
});

test('core company and service pages use fact-safe page, service and breadcrumb schema', async () => {
  const expectations = new Map([
    ['/about/', ['AboutPage', 'BreadcrumbList']],
    ['/contact/', ['ContactPage', 'BreadcrumbList']],
    ['/how-it-works/', ['WebPage', 'BreadcrumbList']],
    ['/working-capital/', ['WebPage', 'Service', 'BreadcrumbList']],
    ['/term-loans/', ['WebPage', 'Service', 'BreadcrumbList']],
    ['/business-line-of-credit/', ['WebPage', 'Service', 'BreadcrumbList']],
  ]);

  for (const [urlPath, requiredTypes] of expectations) {
    const html = await readFile(fileForUrlPath(urlPath), 'utf8');
    const schemaBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    const schemas = schemaBlocks.map((match) => JSON.parse(match[1]));
    const types = new Set(schemas.flatMap((schema) => [...graphTypes(schema)]));
    for (const requiredType of requiredTypes) {
      assert.ok(types.has(requiredType), urlPath + ' needs ' + requiredType + ' schema');
    }
    for (const schema of schemas) {
      for (const node of schema['@graph'] ?? [schema]) {
        if (node['@type'] === 'Service') {
          assert.deepEqual(node.provider, { '@id': origin + '/#organization' });
          assert.doesNotMatch(JSON.stringify(node), /\b(guaranteed|minimum|maximum|licensed|certified)\b/i);
        }
      }
    }
  }
});

test('editorial and corrections policies are public, dated and mutually linked', async () => {
  for (const trustPath of ['/editorial-policy/', '/corrections-policy/']) {
    const html = await readFile(fileForUrlPath(trustPath), 'utf8');
    assert.ok(html.includes('<link rel="canonical" href="' + origin + trustPath + '">'));
    assert.ok(html.includes('<strong>Effective:</strong> August 9, 2026'));
    assert.ok(html.includes('<strong>Last updated:</strong> August 9, 2026'));
    assert.ok(html.includes('/editorial-policy/'));
    assert.ok(html.includes('/corrections-policy/'));
    assert.ok(html.includes('info@suttonfunding.com'));
  }
});

test('privacy policy has visible dates and no unverified operational security promises', async () => {
  const html = await readFile(fileForUrlPath('/privacy-policy/'), 'utf8');
  assert.ok(html.includes('<strong>Effective:</strong> August 9, 2026'));
  assert.ok(html.includes('<strong>Last updated:</strong> August 9, 2026'));
  assert.doesNotMatch(
    html,
    /encryption at rest|multi-factor authentication|penetration testing|intrusion detection|background checks|surveillance systems|security personnel/i,
  );
  assert.ok(html.includes('No method of transmission or storage is completely secure'));
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

test('every canonical page is reachable from the homepage through site links', async () => {
  const sitemap = await readFile(path.join(siteRoot, 'sitemap.xml'), 'utf8');
  const canonicalPaths = new Set(
    [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname),
  );
  const visited = new Set(['/']);
  const queue = ['/'];

  while (queue.length) {
    const currentPath = queue.shift();
    const html = await readFile(fileForUrlPath(currentPath), 'utf8');
    for (const match of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
      const target = new URL(match[1], origin + currentPath);
      if (target.origin !== origin || !canonicalPaths.has(target.pathname) || visited.has(target.pathname)) continue;
      visited.add(target.pathname);
      queue.push(target.pathname);
    }
  }

  assert.deepEqual([...canonicalPaths].filter((pathname) => !visited.has(pathname)), []);
});

test('desktop primary navigation is centered independently from the actions', async () => {
  const homepage = await readFile(path.join(siteRoot, 'index.html'), 'utf8');
  const navigationCss = await readFile(path.join(siteRoot, 'assets/site-navigation.css'), 'utf8');
  const primaryStart = homepage.indexOf('<!-- Desktop Primary Links -->');
  const actionsStart = homepage.indexOf('<!-- Desktop Actions -->');
  const mobileStart = homepage.indexOf('<button class="sf-menu-toggle"');
  assert.ok(primaryStart >= 0 && actionsStart > primaryStart && mobileStart > actionsStart);

  const primary = homepage.slice(primaryStart, actionsStart);
  const actions = homepage.slice(actionsStart, mobileStart);
  assert.match(primary, /class="sf-nav-primary"/);
  for (const label of ['Funding Options', 'Calculator', 'Resources', 'Why Sutton?']) {
    assert.ok(primary.includes(`>${label}</a>`), `${label} must remain in the centered group`);
  }
  assert.doesNotMatch(primary, />Login<|>Apply Now</);
  assert.match(actions, />Login</);
  assert.match(actions, />\s*Apply Now\s*</);
  assert.match(navigationCss, /@media \(min-width: 1200px\)[\s\S]*?\.sf-nav-primary\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?left:\s*50%;[\s\S]*?transform:\s*translateX\(-50%\);/);
});

test('all canonical pages use the shared accessible responsive navigation', async () => {
  const sitemap = await readFile(path.join(siteRoot, 'sitemap.xml'), 'utf8');
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const expectedCalculator = '/resources/apr-factor-rate-total-cost/#calculator';
  const allowedPlacements = new Set(['nav', 'mobile_nav', 'hero', 'calculator', 'product', 'contact', 'page_bottom', 'footer', 'content']);

  for (const location of locations) {
    const url = new URL(location);
    const html = await readFile(fileForUrlPath(url.pathname), 'utf8');
    assert.equal((html.match(/class="sf-skip-link"/g) || []).length, 1, `${url.pathname} skip link`);
    assert.equal((html.match(/data-site-header/g) || []).length, 1, `${url.pathname} shared header`);
    assert.equal((html.match(/data-mobile-menu/g) || []).length, 1, `${url.pathname} mobile menu`);
    assert.equal((html.match(/id="main-content"/g) || []).length, 1, `${url.pathname} main target`);
    assert.match(html, /id="main-content" tabindex="-1"/);
    assert.ok(html.includes('/assets/site-navigation.css?v=9582638005a9'));
    assert.ok(html.includes('/assets/site-navigation.js?v=277a68ef2c82'));
    assert.equal((html.match(new RegExp(`href="${expectedCalculator}"`, 'g')) || []).length, 2, `${url.pathname} calculator routes`);
    assert.match(html, /aria-controls="site-mobile-menu" aria-expanded="false"/);
    assert.match(html, /id="site-mobile-menu"[^>]*aria-hidden="true" inert data-mobile-menu/);

    for (const match of html.matchAll(/<a\b([^>]*href="https:\/\/apply\.suttonfunding\.com\/apply"[^>]*)>([\s\S]*?)<\/a>/g)) {
      const placement = match[1].match(/data-cta-location="([^"]+)"/)?.[1];
      assert.ok(placement && allowedPlacements.has(placement), `${url.pathname} has safe CTA placement`);
      assert.doesNotMatch(match[2], /Check Eligibility|Explore Options|Get Funded|Start an Application|Apply for Business Funding/);
    }
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
