import { Link } from "react-router-dom";
import ScoutMascot from "@/components/ScoutMascot";

const features = [
  ["New DOT Leads", "Find recently registered trucking companies before competitors start calling."],
  ["Renewal Opportunities", "Prioritize outreach around renewal timing and buying signals."],
  ["Carrier Intelligence", "Review carrier identity, authority, safety, insurance, and fleet details from one workspace."],
  ["Built-In CRM", "Move prospects from search to follow-up without leaving the trucking lead workflow."],
];

const workflow = [
  ["01", "Find carriers", "Search and filter trucking companies by DOT, state, fleet size, cargo, and timing."],
  ["02", "Review intelligence", "Open premium carrier profiles with insurance filings, safety rating, inspections, and crash history."],
  ["03", "Work the pipeline", "Save qualified leads into CRM stages and keep outreach moving."],
];

export default function HomePage() {
  return (
    <div className="mtl-homepage">
      <style>{`
        .mtl-homepage {
          min-height: 100vh;
          overflow: hidden;
          color: #f8fbff;
          background:
            radial-gradient(circle at 16% 16%, rgba(0, 102, 255, 0.24), transparent 26rem),
            radial-gradient(circle at 84% 8%, rgba(14, 165, 233, 0.18), transparent 24rem),
            radial-gradient(circle at 50% 100%, rgba(0, 102, 255, 0.12), transparent 32rem),
            linear-gradient(180deg, #061225 0%, #020713 42%, #020713 100%);
          font-family: Inter, "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        }

        .mtl-homepage::before {
          content: "";
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background-image:
            linear-gradient(rgba(65, 151, 255, 0.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(65, 151, 255, 0.07) 1px, transparent 1px);
          background-size: 62px 62px;
          mask-image: linear-gradient(180deg, #000 0%, rgba(0,0,0,.72) 54%, rgba(0,0,0,.42) 100%);
        }

        .mtl-homepage * {
          box-sizing: border-box;
        }

        .mtl-homepage a {
          color: inherit;
          text-decoration: none;
        }

        .mtl-hero {
          position: relative;
          z-index: 1;
          min-height: 760px;
          padding: 132px 28px 62px;
          overflow: hidden;
        }

        .mtl-hero::after {
          content: "";
          position: absolute;
          left: 50%;
          top: 140px;
          width: min(880px, 90vw);
          height: 360px;
          transform: translateX(-50%);
          border-radius: 999px;
          background: rgba(0, 102, 255, 0.16);
          filter: blur(115px);
          pointer-events: none;
        }

        .mtl-bg-truck,
        .mtl-bg-us {
          position: fixed;
          z-index: 1;
          pointer-events: none;
          user-select: none;
          mix-blend-mode: screen;
          filter: saturate(1.18) contrast(1.06) drop-shadow(0 0 42px rgba(18, 132, 255, 0.58));
        }

        .mtl-bg-truck {
          left: -78px;
          bottom: 22px;
          width: min(46vw, 760px);
          opacity: 0.62;
          mask-image: linear-gradient(90deg, transparent 0%, #000 8%, #000 72%, transparent 100%);
        }

        .mtl-bg-us {
          right: -48px;
          top: 150px;
          width: min(45vw, 780px);
          opacity: 0.58;
          mask-image: radial-gradient(circle at center, #000 0%, #000 62%, transparent 84%);
        }

        .mtl-hero-inner {
          position: relative;
          z-index: 2;
          max-width: 940px;
          margin: 0 auto;
          text-align: center;
        }

        .mtl-floating-logo {
          display: inline-flex;
          justify-content: center;
          width: min(560px, 88vw);
          margin-bottom: 22px;
          filter: drop-shadow(0 0 26px rgba(86, 184, 255, 0.34));
        }

        .mtl-floating-logo img {
          width: 100%;
          height: auto;
          object-fit: contain;
        }

        .mtl-kicker {
          margin: 0 0 12px;
          color: #0de4ff;
          font-size: 15px;
          font-weight: 850;
          text-shadow: 0 0 16px rgba(13, 228, 255, 0.4);
        }

        .mtl-title-wrap {
          position: relative;
        }

        .mtl-title {
          margin: 0;
          color: #ffffff;
          font-size: clamp(42px, 5vw, 72px);
          font-weight: 950;
          line-height: 0.94;
          letter-spacing: -2.3px;
          text-shadow: 0 10px 34px rgba(0, 0, 0, 0.45);
        }

        .mtl-title span {
          background: linear-gradient(90deg, #ffffff 0%, #ffffff 42%, #2384ff 65%, #57b8ff 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .mtl-starline {
          position: absolute;
          left: 50%;
          bottom: -17px;
          width: min(430px, 76vw);
          height: 1px;
          transform: translateX(-50%);
          background: linear-gradient(90deg, transparent, rgba(57, 181, 255, 0.16), rgba(124, 214, 255, 0.95), rgba(57, 181, 255, 0.16), transparent);
          box-shadow: 0 0 16px rgba(57, 181, 255, 0.48);
        }

        .mtl-starline::before {
          content: "";
          position: absolute;
          left: 50%;
          top: 50%;
          width: 8px;
          height: 8px;
          transform: translate(-50%, -50%) rotate(45deg);
          background: #ffffff;
          box-shadow: 0 0 10px #ffffff, 0 0 24px #38bdf8, 0 0 52px rgba(56, 189, 248, 0.75);
        }

        .mtl-subline {
          display: flex;
          justify-content: center;
          align-items: center;
          flex-wrap: wrap;
          gap: 14px;
          margin: 42px 0 13px;
          color: rgba(248, 251, 255, 0.92);
          font-size: 16px;
          font-weight: 730;
        }

        .mtl-subline i {
          width: 4px;
          height: 4px;
          border-radius: 999px;
          background: #57b8ff;
          box-shadow: 0 0 14px rgba(87, 184, 255, 0.85);
        }

        .mtl-desc {
          max-width: 620px;
          margin: 0 auto;
          color: rgba(229, 236, 247, 0.86);
          font-size: 16px;
          line-height: 1.55;
        }

        .mtl-actions {
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          gap: 16px;
          margin-top: 26px;
        }

        .mtl-btn-primary,
        .mtl-btn-secondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 186px;
          padding: 14px 24px;
          border-radius: 10px;
          font-weight: 850;
          transition: transform 170ms ease, box-shadow 170ms ease, background 170ms ease;
        }

        .mtl-btn-primary {
          border: 1px solid rgba(83, 178, 255, 0.6);
          background: linear-gradient(180deg, #147dff 0%, #0068f5 100%);
          color: #ffffff;
          box-shadow: 0 0 30px rgba(0, 102, 255, 0.44), inset 0 1px 0 rgba(255, 255, 255, 0.22);
        }

        .mtl-btn-secondary {
          border: 1px solid rgba(148, 180, 220, 0.34);
          background: rgba(4, 12, 28, 0.66);
          color: #ffffff;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }

        .mtl-btn-primary:hover,
        .mtl-btn-secondary:hover {
          transform: translateY(-1px);
        }

        .mtl-proof {
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          gap: 18px;
          margin-top: 30px;
          color: rgba(248, 251, 255, 0.9);
          font-size: 14px;
          font-weight: 720;
        }

        .mtl-proof span {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          padding: 8px 13px;
          border: 1px solid rgba(85, 166, 255, 0.16);
          border-radius: 999px;
          background: rgba(4, 12, 28, 0.42);
        }

        .mtl-section {
          position: relative;
          z-index: 1;
          max-width: 1180px;
          margin: 0 auto;
          padding: 54px 28px;
        }

        .mtl-section-header {
          max-width: 760px;
          margin-bottom: 28px;
        }

        .mtl-section-eyebrow {
          color: #0de4ff;
          font-size: 13px;
          font-weight: 850;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }

        .mtl-section h2 {
          margin: 12px 0 0;
          color: #ffffff;
          font-size: clamp(30px, 4vw, 48px);
          font-weight: 920;
          letter-spacing: -1px;
        }

        .mtl-feature-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 18px;
        }

        .mtl-card {
          min-height: 190px;
          border: 1px solid rgba(85, 166, 255, 0.16);
          border-radius: 22px;
          background:
            radial-gradient(circle at 18% 0%, rgba(36, 132, 255, 0.12), transparent 16rem),
            rgba(5, 18, 36, 0.72);
          padding: 22px;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 24px 70px rgba(0, 0, 0, 0.22);
          backdrop-filter: blur(18px);
        }

        .mtl-card h3 {
          margin: 0;
          color: #ffffff;
          font-size: 20px;
          font-weight: 870;
        }

        .mtl-card p {
          margin: 14px 0 0;
          color: #aebbd0;
          font-size: 14px;
          line-height: 1.6;
        }

        .mtl-flow {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }

        .mtl-product-preview {
          position: relative;
          z-index: 2;
          max-width: 1220px;
          margin: -64px auto 28px;
          padding: 0 28px 42px;
        }

        .mtl-preview-frame {
          overflow: hidden;
          border: 1px solid rgba(95, 183, 255, 0.24);
          border-radius: 24px;
          background:
            linear-gradient(180deg, rgba(10, 26, 52, 0.92), rgba(3, 10, 24, 0.94)),
            url("/assets/alt-background.png");
          background-size: cover;
          background-position: center;
          box-shadow: 0 26px 110px rgba(0, 102, 255, 0.18), inset 0 1px 0 rgba(255,255,255,0.08);
        }

        .mtl-scout-accent {
          position: relative;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 22px;
          margin: 18px 0 0 auto;
          max-width: 760px;
          border: 1px solid rgba(103, 232, 249, 0.2);
          border-radius: 22px;
          background: rgba(2, 8, 23, 0.52);
          padding: 18px 20px;
          box-shadow: 0 24px 80px rgba(0, 102, 255, 0.12), inset 0 1px 0 rgba(255,255,255,0.06);
          backdrop-filter: blur(18px);
        }

        .mtl-scout-accent h3 {
          margin: 0;
          color: #ffffff;
          font-size: 20px;
          font-weight: 900;
        }

        .mtl-scout-accent p {
          margin: 8px 0 0;
          color: #aebbd0;
          font-size: 14px;
          line-height: 1.6;
        }

        .mtl-preview-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 16px 18px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          background: rgba(2, 8, 23, 0.68);
        }

        .mtl-preview-dots {
          display: flex;
          gap: 7px;
        }

        .mtl-preview-dots span {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: rgba(95, 183, 255, 0.72);
        }

        .mtl-preview-title {
          color: #dff5ff;
          font-size: 13px;
          font-weight: 800;
        }

        .mtl-preview-shell {
          display: grid;
          grid-template-columns: 220px minmax(0, 1fr);
          min-height: 520px;
        }

        .mtl-preview-sidebar {
          padding: 24px 18px;
          border-right: 1px solid rgba(255,255,255,0.08);
          background: rgba(2, 8, 23, 0.5);
        }

        .mtl-preview-nav {
          height: 36px;
          margin-bottom: 12px;
          border-radius: 10px;
          background: rgba(79, 177, 255, 0.12);
        }

        .mtl-preview-nav:first-child {
          background: linear-gradient(90deg, rgba(20, 125, 255, 0.7), rgba(13, 228, 255, 0.28));
        }

        .mtl-preview-nav {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 12px;
          color: rgba(225, 244, 255, 0.68);
          font-size: 12px;
          font-weight: 750;
        }

        .mtl-preview-nav::before {
          content: "";
          width: 10px;
          height: 10px;
          border-radius: 4px;
          background: rgba(103, 232, 249, 0.48);
          box-shadow: 0 0 14px rgba(103, 232, 249, 0.24);
        }

        .mtl-preview-main {
          padding: 24px;
        }

        .mtl-preview-heading {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 18px;
          margin-bottom: 18px;
        }

        .mtl-preview-heading h3 {
          margin: 0;
          color: #ffffff;
          font-size: 21px;
          font-weight: 900;
        }

        .mtl-preview-heading p {
          margin: 5px 0 0;
          color: rgba(174, 187, 208, 0.88);
          font-size: 13px;
        }

        .mtl-preview-pill {
          display: inline-flex;
          align-items: center;
          white-space: nowrap;
          border: 1px solid rgba(103, 232, 249, 0.18);
          border-radius: 999px;
          background: rgba(103, 232, 249, 0.08);
          padding: 7px 11px;
          color: #bff7ff;
          font-size: 12px;
          font-weight: 800;
        }

        .mtl-preview-cards {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
          margin-bottom: 18px;
        }

        .mtl-preview-card,
        .mtl-preview-table,
        .mtl-preview-map {
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 16px;
          background: rgba(2, 12, 30, 0.72);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
        }

        .mtl-preview-card {
          padding: 16px;
          min-height: 112px;
        }

        .mtl-preview-card small {
          display: block;
          color: rgba(174, 187, 208, 0.82);
          font-size: 12px;
          font-weight: 760;
        }

        .mtl-preview-card strong {
          display: block;
          margin-top: 9px;
          color: #ffffff;
          font-size: 25px;
          font-weight: 950;
        }

        .mtl-preview-card span {
          display: inline-flex;
          margin-top: 9px;
          color: #5eead4;
          font-size: 11px;
          font-weight: 850;
        }

        .mtl-preview-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.4fr) minmax(260px, 0.8fr);
          gap: 18px;
        }

        .mtl-preview-table {
          padding: 16px;
        }

        .mtl-preview-panel-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }

        .mtl-preview-panel-title h4 {
          margin: 0;
          color: #ffffff;
          font-size: 15px;
          font-weight: 860;
        }

        .mtl-preview-panel-title span {
          color: #57b8ff;
          font-size: 12px;
          font-weight: 800;
        }

        .mtl-preview-row {
          display: grid;
          grid-template-columns: minmax(160px, 1.35fr) 0.75fr 0.6fr 0.75fr;
          gap: 12px;
          align-items: center;
          min-height: 48px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          color: rgba(226, 237, 248, 0.9);
          font-size: 12px;
        }

        .mtl-preview-row strong {
          display: block;
          color: #ffffff;
          font-size: 13px;
          font-weight: 820;
        }

        .mtl-preview-row em {
          display: block;
          margin-top: 2px;
          color: rgba(174, 187, 208, 0.72);
          font-style: normal;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 11px;
        }

        .mtl-preview-badge {
          display: inline-flex;
          width: fit-content;
          border: 1px solid rgba(87, 184, 255, 0.22);
          border-radius: 999px;
          background: rgba(87, 184, 255, 0.08);
          padding: 4px 8px;
          color: #bae6fd;
          font-size: 11px;
          font-weight: 800;
        }

        .mtl-preview-map {
          min-height: 282px;
          padding: 16px;
        }

        .mtl-pipeline-list {
          display: grid;
          gap: 14px;
          margin-top: 16px;
        }

        .mtl-pipeline-item {
          display: grid;
          gap: 7px;
        }

        .mtl-pipeline-meta {
          display: flex;
          justify-content: space-between;
          color: rgba(226, 237, 248, 0.9);
          font-size: 12px;
          font-weight: 780;
        }

        .mtl-pipeline-track {
          overflow: hidden;
          height: 8px;
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.94);
        }

        .mtl-pipeline-fill {
          display: block;
          height: 100%;
          border-radius: 999px;
          background: linear-gradient(90deg, #147dff, #22d3ee);
          box-shadow: 0 0 18px rgba(34, 211, 238, 0.3);
        }

        .mtl-preview-mini-map {
          min-height: 112px;
          border-radius: 14px;
          background:
            linear-gradient(180deg, rgba(2, 12, 30, 0.16), rgba(2, 12, 30, 0.68)),
            url("/assets/homepage-us-constellation.png");
          background-size: cover;
          background-position: center;
          border: 1px solid rgba(255,255,255,0.07);
        }

        .mtl-step {
          border: 1px solid rgba(85, 166, 255, 0.16);
          border-radius: 24px;
          background: rgba(4, 13, 29, 0.68);
          padding: 26px;
          backdrop-filter: blur(18px);
        }

        .mtl-step-number {
          color: #57b8ff;
          font-size: 13px;
          font-weight: 900;
          letter-spacing: 0.18em;
        }

        .mtl-step h3 {
          margin: 18px 0 10px;
          color: #ffffff;
          font-size: 22px;
          font-weight: 880;
        }

        .mtl-step p {
          margin: 0;
          color: #aebbd0;
          line-height: 1.6;
          font-size: 14px;
        }

        .mtl-cta {
          max-width: 980px;
          margin: 24px auto 82px;
          padding: 44px 28px;
          text-align: center;
          border: 1px solid rgba(85, 166, 255, 0.18);
          border-radius: 28px;
          background:
            radial-gradient(circle at 50% 0%, rgba(36, 132, 255, 0.18), transparent 22rem),
            rgba(5, 18, 36, 0.76);
          box-shadow: 0 0 70px rgba(0, 102, 255, 0.12);
          backdrop-filter: blur(18px);
        }

        .mtl-cta h2 {
          margin: 0;
          font-size: clamp(30px, 4vw, 46px);
          font-weight: 920;
          letter-spacing: -1px;
        }

        .mtl-cta p {
          max-width: 620px;
          margin: 14px auto 0;
          color: #aebbd0;
          line-height: 1.6;
        }

        @media (max-width: 1100px) {
          .mtl-bg-truck,
          .mtl-bg-us {
            opacity: 0.42;
          }

          .mtl-feature-grid,
          .mtl-flow,
          .mtl-preview-cards,
          .mtl-preview-grid {
            grid-template-columns: 1fr 1fr;
          }

          .mtl-preview-shell {
            grid-template-columns: 1fr;
          }

          .mtl-scout-accent {
            max-width: none;
          }

          .mtl-preview-sidebar {
            display: none;
          }
        }

        @media (max-width: 720px) {
          .mtl-hero {
            padding-top: 128px;
          }

          .mtl-bg-truck,
          .mtl-bg-us {
            display: none;
          }

          .mtl-title {
            letter-spacing: -1px;
          }

          .mtl-feature-grid,
          .mtl-flow,
          .mtl-preview-cards,
          .mtl-preview-grid {
            grid-template-columns: 1fr;
          }

          .mtl-floating-logo {
            width: 100%;
          }

          .mtl-scout-accent {
            grid-template-columns: 1fr;
            text-align: center;
          }
        }
      `}</style>

      <section className="mtl-hero">
        <img className="mtl-bg-truck" src="/assets/homepage-truck-constellation.png" alt="" aria-hidden="true" />
        <img className="mtl-bg-us" src="/assets/homepage-us-constellation.png" alt="" aria-hidden="true" />

        <div className="mtl-hero-inner">
          <Link to="/" className="mtl-floating-logo" aria-label="MyTruckingLeads home" onClick={() => window.scrollTo({ top: 0, left: 0, behavior: "auto" })}>
            <img src="/assets/homepage-logo-floating.png" alt="MyTruckingLeads" />
          </Link>

          <p className="mtl-kicker">Smarter Data. Stronger Pipeline. More Wins.</p>
          <div className="mtl-title-wrap">
            <h1 className="mtl-title">
              Carrier Intelligence<br />
              Built For <span>Producers</span>
            </h1>
            <div className="mtl-starline" aria-hidden="true" />
          </div>

          <div className="mtl-subline">
            <span>New DOT Leads</span><i />
            <span>Renewal Opportunities</span><i />
            <span>Carrier Intelligence</span><i />
            <span>Built-In CRM</span>
          </div>

          <p className="mtl-desc">
            The all-in-one platform that helps insurance professionals find, track, and close more trucking accounts.
          </p>

          <div className="mtl-actions">
            <Link to="/signup" className="mtl-btn-primary">Start Free Trial</Link>
            <Link to="/pricing" className="mtl-btn-secondary">View Pricing</Link>
          </div>

          <div className="mtl-proof">
            <span>Real-Time Data</span>
            <span>Compliant & Updated</span>
            <span>Built for Results</span>
          </div>
        </div>
        <div className="mtl-scout-accent">
          <div>
            <h3>Meet Scout — your carrier intelligence sidekick.</h3>
            <p>Scout helps you find new DOT leads, renewal opportunities, FMCSA data, and manage prospects in one clean dashboard.</p>
          </div>
          <ScoutMascot size="lg" className="mx-auto -my-3" />
        </div>
      </section>

      <section className="mtl-product-preview" aria-label="Dashboard preview">
        <div className="mtl-section-header">
          <p className="mtl-section-eyebrow">Inside the workspace</p>
          <h2>Scroll into the dashboard producers use every day.</h2>
        </div>
        <div className="mtl-preview-frame">
          <div className="mtl-preview-topbar">
            <div className="mtl-preview-dots" aria-hidden="true"><span /><span /><span /></div>
            <div className="mtl-preview-title">MyTruckingLeads Dashboard</div>
          </div>
          <div className="mtl-preview-shell">
            <div className="mtl-preview-sidebar" aria-hidden="true">
              {["Dashboard", "Lead Desk", "CRM Pipeline", "Carrier Search", "Marketplace", "Settings"].map((item) => <div className="mtl-preview-nav" key={item}>{item}</div>)}
            </div>
            <div className="mtl-preview-main">
              <div className="mtl-preview-heading">
                <div>
                  <h3>Good afternoon, Producer</h3>
                  <p>Live lead activity, renewal timing, and pipeline movement in one workspace.</p>
                </div>
                <span className="mtl-preview-pill">View All Leads</span>
              </div>
              <div className="mtl-preview-cards">
                {[
                  ["New DOT Leads", "128", "+18% this week"],
                  ["Renewal Opportunities", "42", "Next 30 days"],
                  ["Active Leads", "319", "+24 saved"],
                  ["Converted This Month", "17", "Booked accounts"],
                ].map(([label, value, meta]) => (
                  <div className="mtl-preview-card" key={label}>
                    <small>{label}</small>
                    <strong>{value}</strong>
                    <span>{meta}</span>
                  </div>
                ))}
              </div>
              <div className="mtl-preview-grid">
                <div className="mtl-preview-table">
                  <div className="mtl-preview-panel-title">
                    <h4>Recent Leads</h4>
                    <span>View all</span>
                  </div>
                  {[
                    ["Lone Star Freight LLC", "DOT 4129088", "TX", "New DOT", "Today"],
                    ["Blue Ridge Carrier Group", "DOT 3984412", "NC", "Renewal", "Jun 12"],
                    ["Summit Reefer Lines", "DOT 3760921", "CO", "Carrier", "Active"],
                    ["Gulf Coast Hauling", "DOT 2957710", "FL", "Renewal", "Jun 28"],
                    ["Metro Intermodal LLC", "DOT 3390148", "IL", "New DOT", "Yesterday"],
                  ].map(([name, dot, state, type, date]) => (
                    <div className="mtl-preview-row" key={dot}>
                      <span><strong>{name}</strong><em>{dot}</em></span>
                      <span>{state}</span>
                      <span className="mtl-preview-badge">{type}</span>
                      <span>{date}</span>
                    </div>
                  ))}
                </div>
                <div className="mtl-preview-map">
                  <div className="mtl-preview-panel-title">
                    <h4>Pipeline</h4>
                    <span>CRM</span>
                  </div>
                  <div className="mtl-preview-mini-map" aria-hidden="true" />
                  <div className="mtl-pipeline-list">
                    {[
                      ["New", "84", "86%"],
                      ["Contacted", "51", "58%"],
                      ["Quoted", "29", "36%"],
                      ["Follow Up", "18", "24%"],
                      ["Won", "17", "20%"],
                    ].map(([label, count, width]) => (
                      <div className="mtl-pipeline-item" key={label}>
                        <div className="mtl-pipeline-meta"><span>{label}</span><span>{count}</span></div>
                        <div className="mtl-pipeline-track"><span className="mtl-pipeline-fill" style={{ width }} /></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mtl-section" id="solutions">
        <div className="mtl-section-header">
          <p className="mtl-section-eyebrow">Trucking lead intelligence</p>
          <h2>Everything producers need to find, qualify, and work trucking accounts.</h2>
        </div>

        <div className="mtl-feature-grid">
          {features.map(([title, copy]) => (
            <article className="mtl-card" key={title}>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mtl-section">
        <div className="mtl-section-header">
          <p className="mtl-section-eyebrow">Workflow</p>
          <h2>A cleaner way to turn carrier intelligence into a working pipeline.</h2>
        </div>

        <div className="mtl-flow">
          {workflow.map(([number, title, copy]) => (
            <article className="mtl-step" key={title}>
              <div className="mtl-step-number">{number}</div>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mtl-cta">
        <h2>Ready to work trucking leads with better timing?</h2>
        <p>Agents can start with carrier discovery. Trucking companies looking for insurance can request a quote directly.</p>
        <div className="mtl-actions">
          <Link to="/signup" className="mtl-btn-primary">Start Free Trial</Link>
          <Link to="/quote-request" className="mtl-btn-secondary">Truckers: Get a Quote</Link>
        </div>
      </section>
    </div>
  );
}
