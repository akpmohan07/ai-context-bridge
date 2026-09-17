(function () {
  var stored = null;
  try { stored = localStorage.getItem('theme'); } catch (e) {}
  if (stored === 'light' || stored === 'dark') {
    document.documentElement.setAttribute('data-theme', stored);
  }

  function current() { return document.documentElement.getAttribute('data-theme'); }

  function apply(mode) {
    if (mode === null) {
      document.documentElement.removeAttribute('data-theme');
      try { localStorage.removeItem('theme'); } catch (e) {}
    } else {
      document.documentElement.setAttribute('data-theme', mode);
      try { localStorage.setItem('theme', mode); } catch (e) {}
    }
    updateButton();
  }

  // System -> Light -> Dark -> System
  function cycle() {
    var mode = current();
    apply(mode === null ? 'light' : mode === 'light' ? 'dark' : null);
  }

  function updateButton() {
    var btn = document.getElementById('themeToggle');
    if (!btn) return;
    var mode = current();
    var icon = mode === 'light' ? '☀️' : mode === 'dark' ? '🌙' : '🖥️';
    var label = mode === 'light' ? 'Light theme, click for dark'
      : mode === 'dark' ? 'Dark theme, click to follow system'
      : 'Following system theme, click for light';
    btn.textContent = icon;
    btn.title = label;
    btn.setAttribute('aria-label', label);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('themeToggle');
    if (btn) btn.addEventListener('click', cycle);
    updateButton();
  });
})();
