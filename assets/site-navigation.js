(function () {
  'use strict';

  var header = document.querySelector('[data-site-header]');
  var menu = document.querySelector('[data-mobile-menu]');
  var toggle = document.querySelector('[data-menu-toggle]');
  var closeButton = document.querySelector('[data-menu-close]');
  if (!header || !menu || !toggle || !closeButton) return;

  var desktopQuery = window.matchMedia('(min-width: 1200px)');
  var previousFocus = null;
  var focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function focusableItems() {
    return Array.prototype.filter.call(menu.querySelectorAll(focusableSelector), function (element) {
      return element.getAttribute('aria-hidden') !== 'true';
    });
  }

  function menuIsOpen() {
    return toggle.getAttribute('aria-expanded') === 'true';
  }

  function setMenuOpen(open, restoreFocus) {
    if (open === menuIsOpen()) return;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    menu.setAttribute('aria-hidden', String(!open));
    menu.classList.toggle('is-open', open);
    menu.inert = !open;
    document.body.classList.toggle('sf-menu-open', open);

    if (open) {
      previousFocus = toggle;
      void menu.offsetWidth;
      closeButton.focus({ preventScroll: true });
    } else if (restoreFocus && previousFocus && typeof previousFocus.focus === 'function') {
      previousFocus.focus();
    }
  }

  toggle.addEventListener('click', function () {
    setMenuOpen(!menuIsOpen(), true);
  });

  closeButton.addEventListener('click', function () {
    setMenuOpen(false, true);
  });

  menu.querySelectorAll('a[href]').forEach(function (link) {
    link.addEventListener('click', function () {
      setMenuOpen(false, true);
    });
  });

  document.addEventListener('keydown', function (event) {
    if (!menuIsOpen()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setMenuOpen(false, true);
      return;
    }
    if (event.key !== 'Tab') return;

    var items = focusableItems();
    if (!items.length) {
      event.preventDefault();
      return;
    }
    var first = items[0];
    var last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  function closeAtDesktop() {
    if (desktopQuery.matches && menuIsOpen()) setMenuOpen(false, false);
  }
  if (typeof desktopQuery.addEventListener === 'function') {
    desktopQuery.addEventListener('change', closeAtDesktop);
  } else if (typeof desktopQuery.addListener === 'function') {
    desktopQuery.addListener(closeAtDesktop);
  }

  if (header.classList.contains('sf-header--home')) {
    var updateHeader = function () {
      header.classList.toggle('sf-header--scrolled', window.scrollY > 50);
    };
    updateHeader();
    window.addEventListener('scroll', updateHeader, { passive: true });
  }
})();
