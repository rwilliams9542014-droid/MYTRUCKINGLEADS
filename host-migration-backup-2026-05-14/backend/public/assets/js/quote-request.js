(function () {
  const API_BASE =
    window.MY_TRUCKING_LEADS_API_BASE ||
    document.documentElement.dataset.apiBase ||
    `${window.location.origin}/api`;

  const DOCUMENT_OPTIONS = [
    { value: "loss_runs", label: "Loss Runs" },
    { value: "current_policy_declarations_page", label: "Current Policy Declarations Page" },
    { value: "current_certificate_of_insurance", label: "Current Certificate Of Insurance" },
    { value: "ifta_reports", label: "IFTA Reports" },
    { value: "vehicle_schedule", label: "Vehicle Schedule" },
    { value: "truck_registrations", label: "Truck Registrations" },
    { value: "driver_licenses", label: "Driver Licenses" },
    { value: "driver_list", label: "Driver List" },
    { value: "mvr_reports", label: "MVR Reports" },
    { value: "safety_reports", label: "Safety Reports" },
    { value: "cargo_documentation", label: "Cargo Documentation" },
    { value: "other_supporting_documents", label: "Other Supporting Documents" }
  ];

  const REQUIRED_TYPES = [
    "loss_runs",
    "current_policy_declarations_page",
    "ifta_reports",
    "truck_registrations",
    "driver_licenses",
    "vehicle_schedule"
  ];

  const MAX_FILES = 20;
  const selectedFiles = [];

  function byId(id) {
    return document.getElementById(id);
  }

  function getTypeLabel(type) {
    const option = DOCUMENT_OPTIONS.find((item) => item.value === type);
    return option ? option.label : "Other Supporting Documents";
  }

  function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  function setStatus(type, message) {
    const element = byId("quoteStatus");
    if (!element) return;
    element.className = `status-card status-${type}`;
    element.textContent = message;
    element.hidden = false;
  }

  function clearStatus() {
    const element = byId("quoteStatus");
    if (!element) return;
    element.hidden = true;
    element.textContent = "";
  }

  function updateChecklist() {
    const selectedTypes = new Set(selectedFiles.map((entry) => entry.documentType));
    let submitted = 0;

    REQUIRED_TYPES.forEach((type) => {
      const present = selectedTypes.has(type);
      const item = document.querySelector(`[data-required-type="${type}"]`);
      if (item) {
        item.classList.toggle("complete", present);
        const badge = item.querySelector(".check-state");
        if (badge) {
          badge.textContent = present ? "Submitted" : "Needed";
        }
      }
      if (present) submitted += 1;
    });

    const percent = Math.round((submitted / REQUIRED_TYPES.length) * 100);
    const count = byId("documentCompletionCount");
    const percentLabel = byId("documentCompletionPercent");
    const progress = byId("documentCompletionBar");
    if (count) count.textContent = `${submitted} of ${REQUIRED_TYPES.length}`;
    if (percentLabel) percentLabel.textContent = `${percent}%`;
    if (progress) progress.style.width = `${percent}%`;
  }

  function renderSelectedFiles() {
    const list = byId("documentList");
    const empty = byId("documentEmpty");
    if (!list) return;

    list.innerHTML = "";

    if (!selectedFiles.length) {
      if (empty) empty.hidden = false;
      updateChecklist();
      return;
    }

    if (empty) empty.hidden = true;

    selectedFiles.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "document-row";
      row.innerHTML = `
        <div class="document-meta">
          <strong>${entry.file.name}</strong>
          <span>${formatBytes(entry.file.size)}</span>
        </div>
        <label class="document-field">
          <span>Category</span>
          <select aria-label="Document category">
            ${DOCUMENT_OPTIONS.map((option) => `
              <option value="${option.value}"${option.value === entry.documentType ? " selected" : ""}>${option.label}</option>
            `).join("")}
          </select>
        </label>
        <button type="button" class="remove-doc">Remove</button>
      `;

      const select = row.querySelector("select");
      select.addEventListener("change", () => {
        entry.documentType = select.value;
        updateChecklist();
      });

      row.querySelector(".remove-doc").addEventListener("click", () => {
        const index = selectedFiles.findIndex((item) => item.id === entry.id);
        if (index >= 0) {
          selectedFiles.splice(index, 1);
          renderSelectedFiles();
        }
      });

      list.appendChild(row);
    });

    updateChecklist();
  }

  function addIncomingFiles(fileList) {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;

    if (selectedFiles.length + incoming.length > MAX_FILES) {
      setStatus("error", `You can upload up to ${MAX_FILES} files per quote request.`);
      return;
    }

    incoming.forEach((file) => {
      selectedFiles.push({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
        file,
        documentType: "other_supporting_documents"
      });
    });

    clearStatus();
    renderSelectedFiles();
  }

  function appendFilePayload(formData) {
    selectedFiles.forEach((entry) => {
      formData.append("documents", entry.file);
      formData.append("documentTypes[]", entry.documentType);
    });
  }

  function renderSuccess(lead) {
    const summary = byId("leadResult");
    if (!summary) return;
    summary.hidden = false;
    summary.innerHTML = `
      <div class="result-badge result-${String(lead.leadTier || "").toLowerCase()}">${lead.leadTier} Lead</div>
      <h3>Request received for ${lead.companyName || "your company"}</h3>
      <p>Your quote request is in the marketplace. Agents will review your submission and reach out using the contact details you provided.</p>
      <div class="result-grid">
        <div><span>Lead Score</span><strong>${lead.leadScore}</strong></div>
        <div><span>Documents</span><strong>${lead.documentCompletionPercent}%</strong></div>
        <div><span>Tier Price</span><strong>$${Number(lead.listPrice || lead.price || 0).toFixed(2)}</strong></div>
        <div><span>Coverage Window</span><strong>${lead.coverageNeededWithin || "30 Days"}</strong></div>
      </div>
    `;
  }

  async function submitForm(event) {
    event.preventDefault();
    clearStatus();

    const form = event.currentTarget;
    const submitButton = byId("quoteSubmitButton");
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Submitting Request...";
    }

    try {
      const formData = new FormData(form);
      appendFilePayload(formData);

      const response = await fetch(`${API_BASE}/marketplace/quote-requests`, {
        method: "POST",
        body: formData
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Unable to submit your quote request right now.");
      }

      form.reset();
      selectedFiles.splice(0, selectedFiles.length);
      renderSelectedFiles();
      renderSuccess(data.lead || {});
      setStatus("success", "Your quote request has been submitted. A lead record was created for agents immediately.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setStatus("error", error.message || "Unable to submit your quote request.");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Get My Trucking Insurance Quotes";
      }
    }
  }

  function bindDropzone() {
    const dropzone = byId("documentDropzone");
    const input = byId("documentInput");
    if (!dropzone || !input) return;

    ["dragenter", "dragover"].forEach((eventName) => {
      dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropzone.classList.add("drag-active");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropzone.classList.remove("drag-active");
      });
    });

    dropzone.addEventListener("drop", (event) => {
      addIncomingFiles(event.dataTransfer?.files);
    });

    dropzone.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      addIncomingFiles(input.files);
      input.value = "";
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const form = byId("quoteRequestForm");
    if (!form) return;

    byId("year").textContent = new Date().getFullYear();
    bindDropzone();
    renderSelectedFiles();
    form.addEventListener("submit", submitForm);
  });
})();
