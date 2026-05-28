import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import ScoutMascot from "@/components/ScoutMascot";
import { buildScoutAnswer } from "@/lib/scoutAssistant";

const quickPrompts = [
  "Explain this carrier profile",
  "What should I look for before contacting this carrier?",
  "Help me understand these safety scores",
  "Draft a follow-up message",
  "What does this insurance filing mean?",
];

export default function ScoutHelpButton() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [carrierContext, setCarrierContext] = useState(null);
  const [messages, setMessages] = useState([]);
  const [customPrompt, setCustomPrompt] = useState("");

  const hasCarrierContext = Boolean(carrierContext && Object.keys(carrierContext).length);
  const introText = useMemo(() => {
    if (hasCarrierContext) {
      const name = carrierContext.carrierName || carrierContext.name || "this carrier";
      return `I can help you understand ${name}, safety signals, renewal timing, and next steps.`;
    }
    return "I can help you understand carrier data, safety signals, renewals, and next steps.";
  }, [carrierContext, hasCarrierContext]);

  useEffect(() => {
    function updateScoutContext(event) {
      setCarrierContext(event.detail?.carrier || null);
      setMessages([]);
    }

    window.addEventListener("mtl:scout-context", updateScoutContext);
    return () => window.removeEventListener("mtl:scout-context", updateScoutContext);
  }, []);

  function askScout(prompt) {
    const answer = buildScoutAnswer(prompt, {
      carrier: carrierContext,
      pathname: location.pathname,
    });
    setMessages((current) => [...current, { prompt, answer }]);
  }

  function submitCustomPrompt(event) {
    event.preventDefault();
    const prompt = customPrompt.trim();
    if (!prompt) return;
    askScout(prompt);
    setCustomPrompt("");
  }

  async function copyAnswer(text) {
    if (!navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(text);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-2xl border border-cyan-300/20 bg-[#03101f]/88 px-3 py-2 text-left shadow-[0_18px_60px_rgba(0,0,0,0.32),0_0_34px_rgba(34,211,238,0.16)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-cyan-300/35 hover:bg-[#06172b]/92 sm:bottom-6 sm:right-6"
        aria-label="Ask Scout"
        title="Need help understanding this carrier?"
      >
        <ScoutMascot size="sm" showGlow={false} />
        <span className="hidden sm:block">
          <span className="block text-sm font-semibold text-white">Ask Scout</span>
          <span className="block text-[11px] text-cyan-100/55">Carrier intelligence help</span>
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/45 p-4 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="ask-scout-title">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-cyan-300/20 bg-[#03101f]/95 shadow-[0_28px_90px_rgba(0,0,0,0.44),0_0_42px_rgba(34,211,238,0.12)]">
            <div className="flex items-start gap-4 border-b border-cyan-300/10 p-5">
              <ScoutMascot size="md" className="shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 id="ask-scout-title" className="text-lg font-bold text-white">Ask Scout</h2>
                    <p className="mt-1 text-sm leading-6 text-navy-300">{introText}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg p-1 text-navy-400 transition-colors hover:bg-white/5 hover:text-white"
                    aria-label="Close Ask Scout"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div className="max-h-[min(68vh,620px)] space-y-4 overflow-y-auto p-5">
              <div className="rounded-xl border border-cyan-300/10 bg-cyan-300/[0.04] p-3 text-sm leading-6 text-navy-300">
                {hasCarrierContext
                  ? "Scout is using the carrier profile currently open on this page."
                  : "Open a carrier profile for the most specific Scout guidance. These prompts still work with general workflow help."}
              </div>
              <div className="space-y-2">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => askScout(prompt)}
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-left text-sm text-navy-200 transition-colors hover:border-cyan-300/20 hover:bg-cyan-300/[0.06] hover:text-white"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <form onSubmit={submitCustomPrompt} className="space-y-2">
                <label className="sr-only" htmlFor="scout-custom-prompt">Ask Scout a question</label>
                <textarea
                  id="scout-custom-prompt"
                  value={customPrompt}
                  onChange={(event) => setCustomPrompt(event.target.value)}
                  rows={2}
                  placeholder="Ask Scout about this carrier..."
                  className="w-full resize-none rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-navy-500 focus:border-cyan-300/30"
                />
                <button type="submit" className="w-full rounded-xl bg-cyan-400 px-3 py-2 text-sm font-bold text-navy-950 transition-colors hover:bg-cyan-300">
                  Ask Scout
                </button>
              </form>
              {messages.length > 0 && (
                <div className="space-y-3">
                  {messages.map((message, index) => (
                    <article key={`${message.prompt}-${index}`} className="rounded-xl border border-white/[0.08] bg-white/[0.035] p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100/55">{message.prompt}</p>
                      <h3 className="mt-2 text-sm font-bold text-white">{message.answer.title}</h3>
                      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-navy-300">{message.answer.body}</p>
                      <button
                        type="button"
                        onClick={() => copyAnswer(message.answer.body)}
                        className="mt-3 text-xs font-semibold text-cyan-200 transition-colors hover:text-white"
                      >
                        Copy response
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
