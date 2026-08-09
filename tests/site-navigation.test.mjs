import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const script = await readFile(new URL('../assets/site-navigation.js', import.meta.url), 'utf8');

class ClassList {
  constructor(...values) {
    this.values = new Set(values);
  }
  contains(value) {
    return this.values.has(value);
  }
  toggle(value, force) {
    if (force === undefined) force = !this.values.has(value);
    if (force) this.values.add(value);
    else this.values.delete(value);
    return force;
  }
}

function createElement(document, classes = []) {
  const attributes = new Map();
  const listeners = new Map();
  return {
    classList: new ClassList(...classes),
    inert: true,
    focusCount: 0,
    getAttribute(name) { return attributes.get(name) ?? null; },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    addEventListener(type, listener) { listeners.set(type, listener); },
    focus() { this.focusCount += 1; document.activeElement = this; },
    listeners,
  };
}

function loadNavigation() {
  const documentListeners = new Map();
  const windowListeners = new Map();
  const mediaListeners = new Map();
  const document = { activeElement: null };
  const header = createElement(document, ['sf-header', 'sf-header--home']);
  const toggle = createElement(document);
  const close = createElement(document);
  const firstLink = createElement(document);
  const lastLink = createElement(document);
  const menu = createElement(document, ['sf-mobile-menu']);
  toggle.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-hidden', 'true');
  menu.querySelectorAll = (selector) => selector === 'a[href]' ? [firstLink, lastLink] : [close, firstLink, lastLink];
  const body = { classList: new ClassList() };
  document.body = body;
  document.querySelector = (selector) => ({
    '[data-site-header]': header,
    '[data-mobile-menu]': menu,
    '[data-menu-toggle]': toggle,
    '[data-menu-close]': close,
  }[selector]);
  document.addEventListener = (type, listener) => documentListeners.set(type, listener);
  const media = {
    matches: false,
    addEventListener(type, listener) { mediaListeners.set(type, listener); },
  };
  const window = {
    scrollY: 0,
    matchMedia() { return media; },
    addEventListener(type, listener) { windowListeners.set(type, listener); },
  };
  document.activeElement = toggle;

  vm.runInNewContext(script, { document, window, String, Array });
  return { body, close, document, documentListeners, firstLink, header, lastLink, media, mediaListeners, menu, toggle, window, windowListeners };
}

test('mobile menu opens accessibly and Escape closes with focus restoration', () => {
  const state = loadNavigation();
  state.toggle.listeners.get('click')();
  assert.equal(state.toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(state.toggle.getAttribute('aria-label'), 'Close navigation menu');
  assert.equal(state.menu.getAttribute('aria-hidden'), 'false');
  assert.equal(state.menu.inert, false);
  assert.equal(state.menu.classList.contains('is-open'), true);
  assert.equal(state.body.classList.contains('sf-menu-open'), true);
  assert.equal(state.document.activeElement, state.close);

  let prevented = false;
  state.documentListeners.get('keydown')({ key: 'Escape', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(state.toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(state.menu.getAttribute('aria-hidden'), 'true');
  assert.equal(state.menu.inert, true);
  assert.equal(state.document.activeElement, state.toggle);
});

test('mobile menu traps forward and reverse Tab navigation', () => {
  const state = loadNavigation();
  state.toggle.listeners.get('click')();
  state.document.activeElement = state.lastLink;
  let forwardPrevented = false;
  state.documentListeners.get('keydown')({ key: 'Tab', shiftKey: false, preventDefault() { forwardPrevented = true; } });
  assert.equal(forwardPrevented, true);
  assert.equal(state.document.activeElement, state.close);

  let reversePrevented = false;
  state.documentListeners.get('keydown')({ key: 'Tab', shiftKey: true, preventDefault() { reversePrevented = true; } });
  assert.equal(reversePrevented, true);
  assert.equal(state.document.activeElement, state.lastLink);
});

test('selecting a mobile link closes the inert menu and restores focus', () => {
  const state = loadNavigation();
  state.toggle.listeners.get('click')();
  state.firstLink.listeners.get('click')();
  assert.equal(state.toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(state.menu.getAttribute('aria-hidden'), 'true');
  assert.equal(state.menu.inert, true);
  assert.equal(state.document.activeElement, state.toggle);
});

test('crossing the desktop breakpoint closes the mobile menu', () => {
  const state = loadNavigation();
  state.toggle.listeners.get('click')();
  state.media.matches = true;
  state.mediaListeners.get('change')();
  assert.equal(state.toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(state.menu.inert, true);
});
