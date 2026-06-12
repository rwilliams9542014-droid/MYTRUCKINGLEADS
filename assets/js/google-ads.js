(function () {
  var googleAdsId = "AW-18211312936";
  var isDebugHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  if (!document.querySelector('script[src*="googletagmanager.com/gtag/js?id=' + googleAdsId + '"]')) {
    var script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + googleAdsId;
    document.head.appendChild(script);
  }

  if (!window.__mtlGoogleAdsConfigured) {
    window.__mtlGoogleAdsConfigured = true;
    window.gtag("js", new Date());
    window.gtag("config", googleAdsId);
    if (isDebugHost) {
      console.info("[Google Ads] Google Ads Tag Loaded", { id: googleAdsId });
    }
  }
})();
