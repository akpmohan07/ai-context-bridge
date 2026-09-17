(function () {
  var GA_ID = 'G-5KV0RFZ91V';

  function loadGA() {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA_ID, { anonymize_ip: true });
  }

  var consent = null;
  try { consent = localStorage.getItem('analytics-consent'); } catch (e) {}

  if (consent === 'accepted') {
    loadGA();
    return;
  }
  if (consent === 'declined') return;

  // No decision yet: show the banner, and only load GA if they accept.
  document.addEventListener('DOMContentLoaded', function () {
    var banner = document.getElementById('consentBanner');
    if (!banner) return;
    banner.classList.add('show');

    document.getElementById('consentAccept').addEventListener('click', function () {
      try { localStorage.setItem('analytics-consent', 'accepted'); } catch (e) {}
      banner.classList.remove('show');
      loadGA();
    });

    document.getElementById('consentDecline').addEventListener('click', function () {
      try { localStorage.setItem('analytics-consent', 'declined'); } catch (e) {}
      banner.classList.remove('show');
    });
  });
})();
