/*
  MyTruckingLeads Meta Pixel integration

  Paste your Meta/Facebook Pixel ID below, replacing PASTE_YOUR_PIXEL_ID_HERE.
  Example:
  const META_PIXEL_ID = "123456789012345";
*/
const META_PIXEL_ID = "1961596024723013";

(function initializeMetaPixel() {
  const isConfigured = META_PIXEL_ID && META_PIXEL_ID !== "PASTE_YOUR_PIXEL_ID_HERE";

  window.mtlTrackCustom = function trackCustom(eventName, parameters = {}) {
    if (!eventName || typeof window.fbq !== "function") return;
    window.fbq("trackCustom", eventName, {
      page_path: window.location.pathname,
      page_title: document.title,
      ...parameters
    });
  };

  window.mtlTrackStandard = function trackStandard(eventName, parameters = {}) {
    if (!eventName || typeof window.fbq !== "function") return;
    window.fbq("track", eventName, {
      page_path: window.location.pathname,
      page_title: document.title,
      ...parameters
    });
  };

  if (!isConfigured) {
    console.info("Meta Pixel is installed but missing a Pixel ID in assets/js/meta-pixel.js.");
    return;
  }

  !function(f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function() {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    t = b.createElement(e);
    t.async = true;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");

  window.fbq("init", META_PIXEL_ID);
  window.fbq("track", "PageView");

  function getText(element) {
    return String(element?.innerText || element?.textContent || element?.ariaLabel || "").trim().replace(/\s+/g, " ");
  }

  function trackClick(eventName, element, extra = {}) {
    window.mtlTrackCustom(eventName, {
      click_text: getText(element).slice(0, 120),
      click_url: element?.href || element?.dataset?.href || "",
      element_id: element?.id || "",
      element_classes: element?.className || "",
      ...extra
    });
  }

  function trackPricingVisit() {
    const path = window.location.pathname.toLowerCase();
    if (path.endsWith("/pricing.html") || path.endsWith("/pricing")) {
      window.mtlTrackCustom("PricingPageVisit");
    }
  }

  function bindClickTracking() {
    document.addEventListener("click", (event) => {
      const element = event.target.closest("a, button");
      if (!element) return;

      const text = getText(element).toLowerCase();
      const href = String(element.getAttribute("href") || element.href || "").toLowerCase();
      const id = String(element.id || "").toLowerCase();
      const classes = String(element.className || "").toLowerCase();

      const isSignup =
        id.includes("signup") ||
        href.includes("signup") ||
        text.includes("sign up") ||
        text.includes("start free trial") ||
        text.includes("create account");
      const isLogin =
        id.includes("login") ||
        href.includes("login") ||
        text === "login" ||
        text.includes("log in") ||
        text.includes("login / account");
      const isCta =
        classes.includes("btn") ||
        classes.includes("cta") ||
        text.includes("start prospecting") ||
        text.includes("get started") ||
        text.includes("view plans") ||
        text.includes("start secure trial");

      if (isSignup) trackClick("SignupButtonClick", element);
      if (isLogin) trackClick("LoginButtonClick", element);
      if (isCta) trackClick("CTAButtonClick", element);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      trackPricingVisit();
      bindClickTracking();
    });
  } else {
    trackPricingVisit();
    bindClickTracking();
  }
})();
