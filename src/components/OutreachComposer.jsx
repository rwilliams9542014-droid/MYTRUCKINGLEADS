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

export default function OutreachComposer({ open, channel = "email", lead = {}, intent = "new-dot", onClose }) {
  const [templates, setTemplates] = useState([]);
  const [usage, setUsage] = useState(null);
  const [templateId, setTemplateId] = useState("");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setStatus("");
    setPreview(null);
    setTo(recipientFor(channel, lead));
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
  }, [channel, intent, lead, open]);

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
      const data = await api.previewOutreach({ channel, lead, to, subject, body });
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
      const payload = { lead, to, subject, body };
      const result = channel === "email"
        ? await api.sendOutreachEmail(payload)
        : await api.sendOutreachSms(payload);
      setStatus(result.message || "Message sent.");
    } catch (err) {
      setStatus(err.message || "Message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`${channel === "email" ? "Email" : "Text"} ${leadName(lead)}`} size="lg">
      <form onSubmit={sendMessage} className="space-y-4">
        {!canSend && <PlanLockedFeature />}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs text-navy-400">
            Template
            <select className="input-field mt-1" value={templateId} onChange={(e) => selectTemplate(e.target.value)}>
              {templates.filter((item) => item.channel === channel).map((template) => (
                <option key={template.id} value={template.id} className="bg-navy-900">{template.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-navy-400">
            To
            <input className="input-field mt-1" value={to} onChange={(e) => setTo(e.target.value)} placeholder={channel === "email" ? "email@example.com" : "+15555555555"} />
          </label>
        </div>
        {channel === "email" && (
          <label className="text-xs text-navy-400 block">
            Subject
            <input className="input-field mt-1" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
        )}
        <label className="text-xs text-navy-400 block">
          Message
          <textarea className="input-field mt-1 min-h-[220px]" value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        {channel === "sms" && <p className="text-xs text-navy-500">{body.length} characters. Texts should include Reply STOP to opt out.</p>}
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
          <Button type="submit" loading={sending} disabled={!canSend}>{sending ? "Sending..." : "Send"}</Button>
        </div>
      </form>
    </Modal>
  );
}
