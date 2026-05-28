import { useEffect, useMemo, useState } from "react";
import { Button, Modal } from "@/components/ui";
import { api } from "@/lib/api";
import PlanLockedFeature from "./PlanLockedFeature";

const MERGE_FIELDS = [
  "carrierName",
  "dotNumber",
  "mcNumber",
  "phone",
  "email",
  "state",
  "renewalDate",
  "cargoHauled",
  "powerUnits",
  "drivers",
  "agentName",
  "agentEmail",
  "agencyName",
  "unsubscribeLink",
];

function leadName(lead = {}) {
  return lead.carrierName || lead.name || lead.carrier_name || "this lead";
}

function recipientFor(channel, lead = {}) {
  return channel === "email" ? (lead.email || "") : (lead.phone || "");
}

export default function OutreachComposer({ open, channel = "email", lead = {}, leads = [], intent = "new-dot", onClose }) {
  const isBulk = Array.isArray(leads) && leads.length > 0;
  const primaryLead = isBulk ? leads[0] || {} : lead;
  const [templates, setTemplates] = useState([]);
  const [usage, setUsage] = useState(null);
  const [templateId, setTemplateId] = useState("");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState("");
  const [sendResult, setSendResult] = useState(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setStatus("");
    setPreview(null);
    setSendResult(null);
    setTo(isBulk ? `${leads.length} selected leads` : recipientFor(channel, primaryLead));
    Promise.all([api.getOutreachTemplates(), api.getOutreachUsage()])
      .then(([templateData, usageData]) => {
        if (!active) return;
        const list = templateData?.templates || [];
        setTemplates(list);
        setUsage(usageData);
        const preferred = list.find((item) => item.channel === channel && item.id.includes(intent))
          || list.find((item) => item.channel === channel);
        if (preferred) {
          setTemplateId(preferred.id);
          setSubject(preferred.subject || "");
          setBody(preferred.body || "");
        }
      })
      .catch((err) => setStatus(err.message || "Outreach tools could not be loaded."));
    return () => {
      active = false;
    };
  }, [channel, intent, isBulk, leads, primaryLead, open]);

  const canSend = useMemo(() => {
    if (!usage?.planAccess) return true;
    return channel === "email" ? usage.planAccess.canSendEmail : usage.planAccess.canSendSms;
  }, [channel, usage]);

  function selectTemplate(id) {
    setTemplateId(id);
    const selected = templates.find((item) => item.id === id);
    if (selected) {
      setSubject(selected.subject || "");
      setBody(selected.body || "");
      setPreview(null);
    }
  }

  async function previewMessage() {
    setStatus("");
    try {
      const data = await api.previewOutreach({ channel, lead: primaryLead, to: isBulk ? primaryLead.email : to, subject, body });
      setPreview(data);
    } catch (err) {
      setStatus(err.message || "Preview could not be created.");
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    setSending(true);
    setStatus("");
    setSendResult(null);
    try {
      const result = isBulk
        ? await api.sendBulkOutreachEmail({ leads, subject, body })
        : await api.sendOutreachEmail({ lead: primaryLead, to, subject, body });
      setSendResult(result);
      const sent = Number(result.sent || 0);
      const skippedNoEmail = Number(result.skippedNoEmail || 0);
      const suppressed = Number(result.suppressed || 0);
      const failed = Number(result.failed || 0);
      setStatus(result.message || `Sent: ${sent}. Skipped no email: ${skippedNoEmail}. Suppressed/opted out: ${suppressed}. Failed: ${failed}.`);
    } catch (err) {
      setStatus(err.message || "Message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isBulk ? `Email ${leads.length} selected leads` : `Email ${leadName(primaryLead)}`} size="lg">
      <form onSubmit={sendMessage} className="space-y-4">
        {!canSend && <PlanLockedFeature />}
        {isBulk && (
          <div className="rounded-xl border border-brand-500/20 bg-brand-500/10 p-3 text-sm text-brand-100">
            This will generate one personalized email for each selected carrier. Carriers without email addresses are skipped and shown in the results.
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs text-navy-400">
            Template
            <select className="input-field mt-1" value={templateId} onChange={(e) => selectTemplate(e.target.value)}>
              {templates.filter((item) => item.channel === "email").map((template) => (
                <option key={template.id} value={template.id} className="bg-navy-900">{template.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-navy-400">
            To
            <input className="input-field mt-1" value={to} onChange={(e) => setTo(e.target.value)} disabled={isBulk} placeholder="email@example.com" />
          </label>
        </div>
        <label className="text-xs text-navy-400 block">
          Subject
          <input className="input-field mt-1" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </label>
        <label className="text-xs text-navy-400 block">
          Message
          <textarea className="input-field mt-1 min-h-[220px]" value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase text-navy-300">Mail merge preview</p>
            <p className="text-xs text-navy-400">{isBulk ? `${leads.length} selected carrier${leads.length === 1 ? "" : "s"}` : "1 selected carrier"}</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {MERGE_FIELDS.map((field) => (
              <span key={field} className="rounded-full border border-white/10 bg-navy-950/60 px-2 py-1 text-[11px] text-navy-300">
                {`{{${field}}}`}
              </span>
            ))}
          </div>
        </div>
        <p className="text-xs text-navy-500">
          Sending uses server-side email credentials only. No provider keys are exposed in the browser.
        </p>
        {preview && (
          <div className="rounded-xl bg-navy-950/70 border border-white/[0.06] p-3 text-sm text-navy-300 whitespace-pre-wrap">
            {preview.subject && <p className="font-semibold text-white mb-2">{preview.subject}</p>}
            {preview.body}
          </div>
        )}
        {status && <div className="rounded-xl bg-brand-500/10 border border-brand-500/20 p-3 text-sm text-brand-200">{status}</div>}
        {sendResult?.results?.length > 0 && (
          <div className="max-h-44 overflow-y-auto rounded-xl border border-white/[0.06] bg-navy-950/70 text-xs">
            {sendResult.results.map((item, index) => (
              <div key={`${item.email || item.dotNumber || item.carrierName || "result"}-${index}`} className="flex flex-col gap-1 border-b border-white/[0.05] px-3 py-2 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-navy-200">{item.carrierName || item.email || "Selected carrier"}</span>
                <span className={item.status === "sent" ? "text-accent-300" : item.status === "failed" ? "text-danger-300" : "text-warning-300"}>
                  {item.status || "processed"}{item.error ? ` - ${item.error}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={previewMessage}>Preview</button>
          <Button type="submit" loading={sending} disabled={!canSend}>{sending ? "Sending..." : isBulk ? `Send ${leads.length} Emails` : "Send Email"}</Button>
        </div>
      </form>
    </Modal>
  );
}
