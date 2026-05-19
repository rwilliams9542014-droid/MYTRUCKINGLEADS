(function () {
  const IS_LOCAL_DEV =
    window.location.protocol === "file:" ||
    ["localhost", "127.0.0.1"].includes(window.location.hostname);

  const API_BASE =
    window.MY_TRUCKING_LEADS_API_BASE ||
    document.documentElement.dataset.apiBase ||
    (IS_LOCAL_DEV
      ? "http://localhost:4000/api"
      : `${window.location.origin}/api`);

  function setMessage(element, type, message) {
    if (!element) return;

    element.className = `alert alert-${type}`;
    element.textContent = message;
    element.classList.remove("d-none");
  }

  function setButtonLoading(button, isLoading, loadingText) {
    if (!button) return;

    if (isLoading) {
      button.dataset.originalText = button.textContent;
      button.disabled = true;
      button.textContent = loadingText;
      return;
    }

    button.disabled = false;
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
    }
  }

  function getDashboardForUser(user) {
    if (IS_LOCAL_DEV) return "user-dashboard.html";

    const plan = user?.plan || "basic";
    const status = String(user?.subscription_status || "").toLowerCase();
    const hasPaidAccess = ["basic", "pro", "premium", "starter", "agency"].includes(plan) && ["active", "trialing"].includes(status);
    return hasPaidAccess ? "user-dashboard.html" : "pricing.html";
  }

  function getSafeRedirect(defaultPath) {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get("redirect");
    if (!redirect || !redirect.startsWith("/") || redirect.startsWith("//")) {
      return defaultPath;
    }
    return redirect;
  }

  async function apiCall(endpoint, payloadOrOptions) {
    const isOptionsObject =
      payloadOrOptions &&
      typeof payloadOrOptions === "object" &&
      (Object.prototype.hasOwnProperty.call(payloadOrOptions, "method") ||
        Object.prototype.hasOwnProperty.call(payloadOrOptions, "body") ||
        Object.prototype.hasOwnProperty.call(payloadOrOptions, "headers"));

    const method = isOptionsObject ? payloadOrOptions.method || "POST" : "POST";
    const headers = {
      "Content-Type": "application/json",
      ...(isOptionsObject && payloadOrOptions.headers ? payloadOrOptions.headers : {})
    };
    const bodyPayload = isOptionsObject ? payloadOrOptions.body : payloadOrOptions;

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers,
      credentials: "include",
      body: method === "GET" || bodyPayload === undefined ? undefined : JSON.stringify(bodyPayload)
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data && data.error ? data.error : `HTTP ${response.status}`);
    }

    if (data && data.user) {
      localStorage.setItem("user", JSON.stringify(data.user));
    }

    return data;
  }

  async function checkAuth() {
    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          localStorage.setItem("user", JSON.stringify(data.user));
          return data.user;
        }
      }

      localStorage.removeItem("user");
      return null;
    } catch {
      localStorage.removeItem("user");
      return null;
    }
  }

  function toggleSignupSection(sectionName, hidden) {
    document.querySelectorAll(`[data-signup-section="${sectionName}"]`).forEach((element) => {
      element.classList.toggle("d-none", hidden);
      element.querySelectorAll("input, select, textarea").forEach((field) => {
        field.disabled = hidden;
        if (hidden) {
          field.dataset.wasRequired = field.required ? "1" : "0";
          field.required = false;
        } else if (field.dataset.wasRequired === "1") {
          field.required = true;
        }
      });
    });
  }

  function disableSignupForm(form, submitButton, messageElement, message) {
    form.querySelectorAll("input, select, button").forEach((element) => {
      element.disabled = true;
    });
    if (submitButton) {
      submitButton.disabled = true;
    }
    setMessage(messageElement, "danger", message);
  }

  document.addEventListener("DOMContentLoaded", async function () {
    const params = new URLSearchParams(window.location.search);
    const inviteToken = String(params.get("invite") || "").trim();
    const isLoginPage = Boolean(document.getElementById("loginForm"));
    const selectedPlan = params.get("plan");
    let inviteContext = null;

    if (["basic", "pro", "premium", "starter", "agency"].includes(selectedPlan)) {
      localStorage.setItem("pendingPlan", selectedPlan);
    }

    const signupPlanSelect = document.getElementById("signupPlan");
    const signupLeadStateGroup = document.getElementById("signupLeadStateGroup");
    const signupLeadStateSelect = document.getElementById("signupLeadState");
    const signupTitle = document.getElementById("signupTitle");
    const signupSubtitle = document.getElementById("signupSubtitle");
    const inviteBanner = document.getElementById("inviteBanner");

    function normalizePlan(plan) {
      if (plan === "starter") return "basic";
      if (plan === "agency") return "premium";
      return plan || "basic";
    }

    function updateLeadStateRequirement() {
      if (!signupPlanSelect || !signupLeadStateGroup || !signupLeadStateSelect) return;
      const plan = normalizePlan(signupPlanSelect.value);
      const needsLeadState = ["basic", "pro"].includes(plan);
      signupLeadStateGroup.classList.toggle("d-none", !needsLeadState);
      signupLeadStateSelect.required = needsLeadState;
      signupLeadStateSelect.disabled = !needsLeadState;
      if (!needsLeadState) signupLeadStateSelect.value = "";
    }

    function applyInviteMode(invite) {
      inviteContext = invite;

      if (signupTitle) signupTitle.textContent = "Create Your Team Login";
      if (signupSubtitle) signupSubtitle.textContent = "Set your username and password to join your agency workspace.";
      if (inviteBanner) {
        const ownerLabel = invite.agencyName || invite.ownerName || "your agency";
        inviteBanner.textContent = `You were invited to join ${ownerLabel} on the ${invite.planName || "Agency Unlimited"} account.`;
        inviteBanner.classList.remove("d-none");
      }

      toggleSignupSection("billing", true);
      toggleSignupSection("plan", true);

      const emailField = document.getElementById("signupEmail");
      if (emailField) {
        emailField.value = invite.email || "";
        emailField.readOnly = true;
      }

      if (signupPlanSelect) {
        const ownerPlan = normalizePlan(invite.plan || invite.ownerPlan || "premium");
        signupPlanSelect.value = ownerPlan;
      }

      const submitButton = document.getElementById("signupSubmit");
      if (submitButton) {
        submitButton.textContent = "Create Team Login";
      }
    }

    if (signupPlanSelect) {
      const pendingPlan = selectedPlan || localStorage.getItem("pendingPlan") || signupPlanSelect.value;
      signupPlanSelect.value = pendingPlan === "starter" ? "basic" : pendingPlan === "agency" ? "premium" : pendingPlan;
      updateLeadStateRequirement();
      signupPlanSelect.addEventListener("change", updateLeadStateRequirement);
    }

    if (params.get("reset") === "1") {
      localStorage.removeItem("user");
      localStorage.removeItem("pendingPlan");
      fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include"
      }).finally(() => {
        window.history.replaceState({}, document.title, window.location.pathname);
      });
    }

    if (isLoginPage && !IS_LOCAL_DEV) {
      const user = await checkAuth();
      if (user) {
        window.location.replace(getSafeRedirect(getDashboardForUser(user)));
        return;
      }
      localStorage.removeItem("user");
    }

    document.body.classList.remove("auth-checking");

    const loginForm = document.getElementById("loginForm");
    const signupForm = document.getElementById("signupForm");
    const message = document.getElementById("authMessage");

    if (signupForm && inviteToken) {
      try {
        const data = await apiCall(`/team/invite/${encodeURIComponent(inviteToken)}`, { method: "GET" });
        applyInviteMode(data.invite || {});
      } catch (err) {
        disableSignupForm(signupForm, document.getElementById("signupSubmit"), message, err.message || "This invitation is not available.");
      }
    }

    if (loginForm) {
      loginForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const submitButton = document.getElementById("loginSubmit");
        const identifier =
          (document.getElementById("loginIdentifier") || document.getElementById("loginEmail") || {}).value?.trim() || "";
        const password = (document.getElementById("loginPassword") || {}).value || "";

        setButtonLoading(submitButton, true, "Logging in...");
        if (message) {
          message.className = "d-none";
          message.textContent = "";
        }

        try {
          const data = await apiCall("/auth/login", { identifier, password });
          setMessage(message, "success", "Login successful. Redirecting...");
          setTimeout(() => {
            window.location.href = getSafeRedirect(getDashboardForUser(data.user));
          }, 500);
        } catch (err) {
          setMessage(message, "danger", err.message || "Login failed.");
        } finally {
          setButtonLoading(submitButton, false, "Logging in...");
        }
      });
    }

    if (signupForm) {
      signupForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const submitButton = document.getElementById("signupSubmit");

        const payload = inviteContext
          ? {
              token: inviteToken,
              firstName: (document.getElementById("signupFirstName") || {}).value?.trim() || "",
              lastName: (document.getElementById("signupLastName") || {}).value?.trim() || "",
              username: (document.getElementById("signupUsername") || {}).value?.trim() || "",
              email: (document.getElementById("signupEmail") || {}).value?.trim() || "",
              phone: (document.getElementById("signupPhone") || {}).value?.trim() || "",
              password: (document.getElementById("signupPassword") || {}).value || ""
            }
          : {
              firstName: (document.getElementById("signupFirstName") || {}).value?.trim() || "",
              lastName: (document.getElementById("signupLastName") || {}).value?.trim() || "",
              username: (document.getElementById("signupUsername") || {}).value?.trim() || "",
              email: (document.getElementById("signupEmail") || {}).value?.trim() || "",
              phone: (document.getElementById("signupPhone") || {}).value?.trim() || "",
              businessName: (document.getElementById("signupBusinessName") || {}).value?.trim() || "",
              billingAddressLine1: (document.getElementById("signupAddress1") || {}).value?.trim() || "",
              billingAddressLine2: (document.getElementById("signupAddress2") || {}).value?.trim() || "",
              billingCity: (document.getElementById("signupCity") || {}).value?.trim() || "",
              billingState: (document.getElementById("signupState") || {}).value?.trim() || "",
              billingPostalCode: (document.getElementById("signupPostalCode") || {}).value?.trim() || "",
              billingCountry: (document.getElementById("signupCountry") || {}).value?.trim() || "US",
              leadState: ["basic", "pro"].includes(normalizePlan((document.getElementById("signupPlan") || {}).value || selectedPlan || localStorage.getItem("pendingPlan") || "basic"))
                ? (document.getElementById("signupLeadState") || {}).value?.trim() || ""
                : "",
              password: (document.getElementById("signupPassword") || {}).value || "",
              plan: normalizePlan((document.getElementById("signupPlan") || {}).value || selectedPlan || localStorage.getItem("pendingPlan") || "basic")
            };

        setButtonLoading(submitButton, true, inviteContext ? "Creating login..." : "Creating account...");
        if (message) {
          message.className = "d-none";
          message.textContent = "";
        }

        try {
          const data = await apiCall(inviteContext ? "/team/invite/accept" : "/auth/signup", payload);
          setMessage(
            message,
            "success",
            inviteContext
              ? "Team login created. Redirecting..."
              : "Account created. Opening secure checkout for your 3-day trial..."
          );
          setTimeout(() => {
            window.location.href = inviteContext
              ? getSafeRedirect(getDashboardForUser(data.user))
              : (data.checkoutUrl || getSafeRedirect(getDashboardForUser(data.user)));
          }, 500);
        } catch (err) {
          setMessage(message, "danger", err.message || (inviteContext ? "Unable to create team login." : "Signup failed."));
        } finally {
          setButtonLoading(submitButton, false, inviteContext ? "Creating login..." : "Creating account...");
        }
      });
    }
  });
})();
