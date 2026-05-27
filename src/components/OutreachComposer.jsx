import { useEffect, useMemo, useState } from "react";
import { Button, Modal } from "@/components/ui";
import { api } from "@/lib/api";
import PlanLockedFeature from "./PlanLockedFeature";

function leadName(lead = {}) {
  return lead.carrierName || lead.name || lead.carrier_name || "this lead";
}

function recipientFor(channel, lead = {}) {
  return channel === "email" ? (lead.email || "") : (lead.phone || "");
}

function signatureFor(user = {}) {
  const name = user.name || [user.firstName, user.lastName].filter(Boolean).join(" ") || "";
  return [
    name,
    user.businessName || user.business_name || "",
    user.email || "",
    user.phone || "",
  ].filter(Boolean).join("\n");
}

function withoutSignature(body = "") {
  return String(body || "").replace(/\n{2,}--\s*\n[\s\S]*$/m, "").trimEnd();
}

function appendSignature(body = "", signature = "") {
  const message = withoutSignature(body);
  const cleanSignature = String(signature || "").trim();
  return cleanSignature ? `${message}\n\n-- \n${cleanSignature}` : message;
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
  const [signature, setSignature] = useState("");
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setStatus("");
    setPreview(null);
    setTo(isBulk ? `${leads.length} selected leads` : recipientFor(channel, primaryLead));
    Promise.all([api.getOutreachTemplates(), api.getOutreachUsage()])
      .then(([templateData, usageData]) => {
        if (!active) return;
        const list = templateData?.templates || [];
        setTemplates(list);
        setUsage(usageData);
        setSignature(signatureFor(usageData?.user || usageData?.profile || {}));
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
      const data = await api.previewOutreach({ channel, lead: primaryLead, to: isBulk ? primaryLead.email : to, subject, body: appendSignature(body, signature) });
      setPreview(data);
    } catch (err) {
      setStatus(err.message || "Preview could not be created.");
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    setSending(true);
    setStatus("");
    try {
      const payloadBody = appendSignature(body, signature);
      const result = isBulk
        ? await api.sendBulkOutreachEmail({ leads, subject, body: payloadBody })
        : await api.sendOutreachEmail({ lead: primaryLead, to, subject, body: payloadBody });
      setStatus(result.message || `${result.sent || 0} email${Number(result.sent || 0) === 1 ? "" : "s"} sent${result.failed ? `, ${result.failed} failed` : ""}.`);
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
            This will generate one personalized email for each selected lead with an email address.
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
        <label className="text-xs text-navy-400 block">
          Email Signature
          <textarea className="input-field mt-1 min-h-[110px]" value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Your name&#10;Agency name&#10;Phone&#10;Email" />
        </label>
        <p className="text-xs text-navy-500">
          Sending uses server-side email credentials only. Configure `RESEND_API_KEY` and `RESEND_FROM_EMAIL`, or `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` in Railway.
        </p>
        {preview && (
          <div className="rounded-xl bg-navy-950/70 border border-white/[0.06] p-3 text-sm text-navy-300 whitespace-pre-wrap">
            {preview.subject && <p className="font-semibold text-white mb-2">{preview.subject}</p>}
            {preview.body}
          </div>
        )}
        {status && <div className="rounded-xl bg-brand-500/10 border border-brand-500/20 p-3 text-sm text-brand-200">{status}</div>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={previewMessage}>Preview</button>
          <Button type="submit" loading={sending} disabled={!canSend}>{sending ? "Sending..." : isBulk ? `Send ${leads.length} Emails` : "Send Email"}</Button>
        </div>
      </form>
    </Modal>
  );
}
