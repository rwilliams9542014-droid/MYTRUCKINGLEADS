(function initializePrivacyRequestForm() {
  const form = document.getElementById("privacyRequestForm");
  const status = document.getElementById("privacyRequestStatus");
  const submit = document.getElementById("privacyRequestSubmit");

  if (!form || !status || !submit) return;

  function setStatus(message, tone = "info") {
    status.textContent = message || "";
    status.className = `request-status ${tone}`;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
      requestType: String(form.requestType?.value || "").trim(),
      name: String(form.name?.value || "").trim(),
      email: String(form.email?.value || "").trim(),
      accountEmail: String(form.accountEmail?.value || "").trim(),
      location: String(form.location?.value || "").trim(),
      details: String(form.details?.value || "").trim(),
      website: String(form.website?.value || "").trim()
    };

    if (!payload.requestType || !payload.name || !payload.email || !payload.details) {
      setStatus("Please choose a request type and enter your name, email, and request details.", "bad");
      return;
    }

    const originalText = submit.textContent || "Send Privacy Request";
    submit.disabled = true;
    submit.textContent = "Sending...";
    setStatus("Sending your privacy request...");

    try {
      const response = await fetch("/api/privacy-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }

      form.reset();
      setStatus(data?.message || "Thanks. Your privacy request was sent successfully.", "good");
    } catch (err) {
      setStatus(err.message || "We could not send your privacy request right now. Please try again.", "bad");
    } finally {
      submit.disabled = false;
      submit.textContent = originalText;
    }
  });
})();
