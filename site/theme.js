(function () {
  var stored = null;
  try { stored = localStorage.getItem('theme'); } catch (e) {}
  if (stored === 'light' || stored === 'dark') {
    document.documentElement.setAttribute('data-theme', stored);
  }

  function apply(mode) {
    if (mode === 'system') {
      document.documentElement.removeAttribute('data-theme');
      try { localStorage.removeItem('theme'); } catch (e) {}
    } else {
      document.documentElement.setAttribute('data-theme', mode);
      try { localStorage.setItem('theme', mode); } catch (e) {}
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var select = document.getElementById('themeSelect');
    if (!select) return;
    select.value = stored === 'light' || stored === 'dark' ? stored : 'system';
    select.addEventListener('change', function () { apply(select.value); });
  });
})();
