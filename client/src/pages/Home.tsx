import { useMemo, useRef, useState } from "react";
import {
  Activity,
  Archive,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Command,
  Database,
  FileText,
  FolderOpen,
  Github,
  Globe2,
  LayoutDashboard,
  Lightbulb,
  Loader2,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  Paperclip,
  Play,
  Plus,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  UploadCloud,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

type Conversation = {
  id: string;
  title: string;
  detail: string;
  time: string;
  active?: boolean;
};

type Source = {
  label: string;
  detail: string;
  kind: string;
};

const initialConversations: Conversation[] = [
  { id: "c1", title: "Q3 retention signals", detail: "4 sources · 12 min ago", time: "12m", active: true },
  { id: "c2", title: "SOC 2 evidence gaps", detail: "8 sources · Yesterday", time: "1d" },
  { id: "c3", title: "Onboarding experiment readout", detail: "3 sources · Sep 14", time: "2d" },
  { id: "c4", title: "Pricing page rollout plan", detail: "6 sources · Sep 12", time: "4d" },
];

const sources: Source[] = [
  { label: "Q3 Product Analytics.pdf", detail: "Page 14 · Retention cohort table", kind: "PDF" },
  { label: "customer-interviews-aug.csv", detail: "Row 182 · Segment: self-serve", kind: "CSV" },
  { label: "Amplitude workspace", detail: "Event: workspace_invited", kind: "LIVE" },
];

const suggestedPrompts = [
  "What changed week over week?",
  "Draft an experiment brief",
  "Find evidence for the churn spike",
];

const metrics = [
  { label: "Groundedness", value: "94.2%", delta: "+3.8%", tone: "lime", note: "last 30 runs" },
  { label: "Citation accuracy", value: "98.7%", delta: "+1.2%", tone: "cyan", note: "human reviewed" },
  { label: "Median latency", value: "2.4s", delta: "−0.6s", tone: "amber", note: "p50 · streaming" },
];

function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "lime" | "cyan" | "amber" }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

function AppLogo() {
  return (
    <div className="brand-lockup">
      <div className="brand-mark"><span></span><span></span><span></span></div>
      <div><strong>AI WORKBENCH</strong><small>RESEARCH / ACTION</small></div>
    </div>
  );
}

export default function Home() {
  const [activeView, setActiveView] = useState<"workspace" | "signals">("workspace");
  const [activeConversation, setActiveConversation] = useState("c1");
  const [conversations, setConversations] = useState(initialConversations);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [streamedAnswer, setStreamedAnswer] = useState("");
  const [liveSources, setLiveSources] = useState<Source[]>(sources);
  const [isUploading, setIsUploading] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [showSources, setShowSources] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const filteredConversations = useMemo(
    () => conversations.filter((item) => item.title.toLowerCase().includes(query.toLowerCase())),
    [conversations, query],
  );

  const runPrompt = async (prompt: string) => {
    setMessage(prompt);
    setIsThinking(true);
    setStreamedAnswer("");
    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: 1, question: prompt }),
      });
      if (!response.ok || !response.body) throw new Error((await response.json().catch(() => null))?.error || "Live chat is unavailable");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const consume = (raw: string) => {
        buffer += raw;
        const events = buffer.split(/\n\n/);
        buffer = events.pop() || "";
        events.forEach((event) => {
          const eventName = event.match(/^event: (.+)$/m)?.[1];
          const data = event.match(/^data: (.+)$/m)?.[1];
          if (!data) return;
          const parsed = JSON.parse(data) as { text?: string; error?: string; sources?: Array<{ id: number; documentId: number; score: number; content: string; index: number }> };
          if (eventName === "delta" && parsed.text) setStreamedAnswer((current) => current + parsed.text);
          if (eventName === "sources" && parsed.sources) setLiveSources(parsed.sources.map((source) => ({ label: `Indexed chunk ${source.index}`, detail: `Relevance ${(source.score * 100).toFixed(1)}% · document ${source.documentId}`, kind: "LIVE" })));
          if (eventName === "error") throw new Error(parsed.error || "Streaming response failed");
        });
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        consume(decoder.decode(value, { stream: true }));
      }
      consume(decoder.decode());
      toast.success("Live answer complete", { description: "Streamed from the server and grounded against indexed sources." });
    } catch (error) {
      toast.error("Live answer unavailable", { description: error instanceof Error ? error.message : "Try again or check your session." });
    } finally {
      setIsThinking(false);
    }
  };

  const createConversation = () => {
    const next = { id: `c${Date.now()}`, title: "Untitled research thread", detail: "0 sources · just now", time: "now", active: true };
    setConversations((items) => [next, ...items.map((item) => ({ ...item, active: false }))]);
    setActiveConversation(next.id);
    toast.success("New conversation ready");
  };

  const handleSubmit = () => {
    if (!message.trim()) return;
    runPrompt(message);
    setMessage("");
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const response = await fetch("/api/documents/upload", { method: "POST", credentials: "include", headers: { "content-type": file.type || "text/plain", "x-file-name": encodeURIComponent(file.name), "x-file-type": file.type || "text/plain", "x-workspace-id": "1" }, body: await file.arrayBuffer() });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Upload failed");
      toast.success(`${file.name} indexed`, { description: `${payload.chunkCount} chunks embedded and persisted.` });
    } catch (error) {
      toast.error("Could not index document", { description: error instanceof Error ? error.message : "Try a TXT, CSV, Markdown, or JSON file." });
    } finally {
      setIsUploading(false);
    }
    event.target.value = "";
  };

  const switchConversation = (id: string) => {
    setActiveConversation(id);
    setConversations((items) => items.map((item) => ({ ...item, active: item.id === id })));
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <AppLogo />
          <button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={17} /></button>
        </div>
        <div className="workspace-switcher">
          <div className="workspace-avatar">N</div>
          <div><small>WORKSPACE</small><strong>Northstar Labs</strong></div>
          <ChevronDown size={15} className="muted-icon" />
        </div>
        <button className="new-thread" onClick={createConversation}><Plus size={16} /> New research thread <span>⌘ K</span></button>
        <nav className="side-nav" aria-label="Primary navigation">
          <button className={activeView === "workspace" ? "nav-item active" : "nav-item"} onClick={() => { setActiveView("workspace"); setMobileNav(false); }}><LayoutDashboard size={16} /> Workspace</button>
          <button className={activeView === "signals" ? "nav-item active" : "nav-item"} onClick={() => { setActiveView("signals"); setMobileNav(false); }}><BarChart3 size={16} /> Product signals <Pill tone="lime">LIVE</Pill></button>
          <button className="nav-item" onClick={() => toast("Knowledge base", { description: "Document collections are available from the upload tray." })}><Database size={16} /> Knowledge base</button>
        </nav>
        <div className="side-section-heading"><span>RECENT THREADS</span><button className="icon-button" aria-label="Thread options"><MoreHorizontal size={16} /></button></div>
        <div className="thread-list">
          {filteredConversations.map((item) => (
            <button key={item.id} className={`thread-item ${activeConversation === item.id ? "selected" : ""}`} onClick={() => switchConversation(item.id)}>
              <MessageSquareText size={15} /><span><strong>{item.title}</strong><small>{item.detail}</small></span><time>{item.time}</time>
            </button>
          ))}
          {filteredConversations.length === 0 && <div className="empty-search">No threads match “{query}”</div>}
        </div>
        <div className="sidebar-footer">
          <div className="usage-card"><div className="usage-line"><span>Context usage</span><strong>34%</strong></div><div className="progress"><span style={{ width: "34%" }}></span></div><small>8.4k / 25k tokens</small></div>
          <button className="nav-item" onClick={() => toast("Settings", { description: "Workspace preferences are available in the next iteration." })}><Settings2 size={16} /> Settings</button>
          <div className="profile-row"><div className="profile-avatar">PS</div><div><strong>Priya Shah</strong><small>Builder workspace</small></div><MoreHorizontal size={16} className="muted-icon" /></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button menu-trigger" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={19} /></button>
          <div className="breadcrumbs"><span>Workspace</span><span>/</span><strong>{activeView === "workspace" ? "Research thread" : "Product signals"}</strong></div>
          <div className="topbar-actions">
            <div className="global-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search threads" /><kbd>⌘ /</kbd></div>
            <a href="https://github.com/priyavellanki216/ai-workbench" target="_blank" rel="noreferrer" className="icon-button" aria-label="Open GitHub"><Github size={17} /></a>
            <button className="help-button" onClick={() => toast("AI Workbench", { description: "A grounded research and action platform for customer-facing AI." })}><CircleHelp size={16} /> Help</button>
          </div>
        </header>

        {activeView === "signals" ? (
          <section className="signals-view page-enter">
            <div className="page-heading"><div><div className="eyebrow"><Activity size={13} /> DEMO TELEMETRY / SAMPLE WORKSPACE</div><h1>Product signals</h1><p>This snapshot is seeded for the demo. In production, these cards are fed by measured feedback, latency, and evaluation events.</p></div><button className="secondary-button" onClick={() => toast("Export queued", { description: "CSV export will appear in your downloads." })}><ArrowUpRight size={15} /> Export report</button></div>
            <div className="metric-grid">{metrics.map((metric) => <div className="metric-card" key={metric.label}><div className="metric-label"><span className={`metric-dot ${metric.tone}`}></span>{metric.label}<MoreHorizontal size={15} className="muted-icon" /></div><div className="metric-value">{metric.value}</div><div className="metric-footer"><span className="delta-positive">{metric.delta}</span><span>{metric.note}</span></div></div>)}</div>
            <div className="signals-grid"><div className="panel signal-chart"><div className="panel-heading"><div><span className="eyebrow">QUALITY TREND</span><h2>Groundedness by release</h2></div><Pill tone="lime">stable</Pill></div><div className="chart-wrap"><div className="chart-y"><span>100</span><span>90</span><span>80</span><span>70</span></div><div className="chart-area"><div className="grid-lines"><i></i><i></i><i></i><i></i></div><svg viewBox="0 0 600 230" preserveAspectRatio="none" className="line-chart" aria-label="Groundedness trend"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#b7f36b" stopOpacity=".24"/><stop offset="1" stopColor="#b7f36b" stopOpacity="0"/></linearGradient></defs><path d="M0 166 C42 162 53 137 92 143 S135 168 177 126 S225 117 259 107 S304 122 336 88 S377 74 406 85 S447 57 477 71 S523 50 600 28 L600 230 L0 230 Z" fill="url(#chartFill)"/><path d="M0 166 C42 162 53 137 92 143 S135 168 177 126 S225 117 259 107 S304 122 336 88 S377 74 406 85 S447 57 477 71 S523 50 600 28" fill="none" stroke="#b7f36b" strokeWidth="3" vectorEffect="non-scaling-stroke"/></svg><div className="chart-x"><span>Aug 19</span><span>Aug 26</span><span>Sep 02</span><span>Sep 09</span><span>Sep 16</span></div></div></div></div><div className="panel failure-panel"><div className="panel-heading"><div><span className="eyebrow">FAILURE TAXONOMY</span><h2>Where answers break</h2></div><button className="icon-button"><MoreHorizontal size={16} /></button></div><div className="failure-list"><div><span><i className="failure-dot cyan"></i>Unsupported claim</span><strong>41%</strong></div><div className="mini-progress"><span style={{ width: "41%" }}></span></div><div><span><i className="failure-dot amber"></i>Missing citation</span><strong>28%</strong></div><div className="mini-progress"><span className="amber-fill" style={{ width: "28%" }}></span></div><div><span><i className="failure-dot violet"></i>Tool timeout</span><strong>19%</strong></div><div className="mini-progress"><span className="violet-fill" style={{ width: "19%" }}></span></div><div><span><i className="failure-dot gray"></i>Other</span><strong>12%</strong></div><div className="mini-progress"><span className="gray-fill" style={{ width: "12%" }}></span></div></div><div className="callout"><ShieldCheck size={16} /><span><strong>Safety check passed</strong><small>Grounding guardrails blocked 17 unsupported claims this week.</small></span></div></div></div>
            <div className="panel table-panel"><div className="panel-heading"><div><span className="eyebrow">SHIP LOG / SAMPLE</span><h2>Build → deploy → learn</h2></div><Pill>7 sample releases</Pill></div><div className="release-row header"><span>RELEASE</span><span>CHANGE</span><span>OBSERVED IMPACT</span><span>STATUS</span></div><div className="release-row"><span><strong>v0.7.0</strong><small>Sep 12</small></span><span>Citation reranker</span><span><b className="delta-positive">+3.8%</b> groundedness</span><span><Pill tone="lime"><Check size={12} /> Verified</Pill></span></div><div className="release-row"><span><strong>v0.6.2</strong><small>Sep 06</small></span><span>Tool timeout budget</span><span><b className="delta-positive">−0.6s</b> p50 latency</span><span><Pill tone="cyan"><Check size={12} /> Verified</Pill></span></div><div className="release-row"><span><strong>v0.6.0</strong><small>Aug 29</small></span><span>Feedback loop</span><span><b className="delta-positive">+14%</b> feedback rate</span><span><Pill tone="amber">Monitoring</Pill></span></div></div>
          </section>
        ) : (
          <section className="workspace-view page-enter">
            <div className="workspace-heading"><div><div className="eyebrow"><span className="status-dot"></span> AI SYSTEMS ONLINE</div><h1>Make the next decision<br /><em>with evidence.</em></h1><p>Ask across your workspace, inspect the trace, and turn research into action without losing the source trail.</p></div><div className="heading-actions"><button className="secondary-button" onClick={() => runPrompt("What changed in self-serve retention this quarter, and what should we do next?")}><Play size={14} /> Run live</button><button className="primary-button" onClick={() => fileInput.current?.click()} disabled={isUploading}><UploadCloud size={15} /> {isUploading ? "Indexing…" : "Add sources"}</button><input ref={fileInput} type="file" hidden accept=".txt,.csv,.md,.json" onChange={handleUpload} /></div></div>
            <div className="workspace-grid">
              <div className="conversation-column">
                <div className="panel answer-panel"><div className="answer-meta"><div className="assistant-id"><div className="assistant-orb"><Sparkles size={16} /></div><span><strong>Workbench / Researcher</strong><small>gpt-5 · grounded mode</small></span></div><div className="answer-actions"><Pill tone="lime"><span className="status-dot small"></span> {isThinking ? "Streaming" : "Grounded"}</Pill><button className="icon-button"><MoreHorizontal size={16} /></button></div></div><div className="question">What changed in self-serve retention this quarter, and what should we do next?</div>{streamedAnswer ? <div className="answer-copy live-answer"><p>{streamedAnswer}</p>{isThinking && <span className="stream-caret">▋</span>}</div> : <div className="answer-copy"><p>Self-serve retention is down <strong>4.7 points</strong> quarter over quarter, but the drop is concentrated in workspaces that <strong>never invite a second teammate</strong>. The strongest leading indicator is a missing collaboration moment in the first 7 days — not a pricing objection.</p><p>That suggests a focused intervention: trigger a role-based invite prompt after the first successful workflow, then measure <strong>workspace_invited → retained_30d</strong> by cohort.</p></div>}<div className="recommendation"><div className="recommendation-icon"><Lightbulb size={16} /></div><div><span className="eyebrow">RECOMMENDED NEXT MOVE</span><strong>Ship an invite nudge experiment for self-serve teams</strong><small>Owner: Growth · estimated effort: 2 days · success metric: +8% invite rate</small></div><button className="arrow-button" onClick={() => toast.success("Experiment brief staged for approval") }><ArrowUpRight size={16} /></button></div><div className="answer-footer"><div className="confidence"><span className="confidence-ring">92</span><span><strong>High confidence</strong><small>{liveSources.length} sources · streamed with citations</small></span></div><div className="feedback"><span>Was this useful?</span><button className={feedback === "up" ? "feedback-button selected" : "feedback-button"} onClick={() => { setFeedback("up"); toast.success("Feedback saved"); }}><ThumbsUp size={15} /></button><button className={feedback === "down" ? "feedback-button selected negative" : "feedback-button"} onClick={() => { setFeedback("down"); toast("Thanks — we’ll inspect this run"); }}><ThumbsDown size={15} /></button></div></div></div>
                <div className="panel composer-panel"><div className="composer-label"><span className="live-indicator"></span> Ask your workspace <Pill>⌘ Enter</Pill></div><textarea value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") handleSubmit(); }} placeholder="Ask a question, compare sources, or describe an action…" rows={3}></textarea><div className="composer-bottom"><div className="composer-tools"><button className="tool-button" onClick={() => fileInput.current?.click()}><Paperclip size={15} /> Attach</button><button className="tool-button" onClick={() => toast("Research mode", { description: "Grounded mode only uses indexed workspace sources." })}><ShieldCheck size={15} /> Grounded only <ChevronDown size={13} /></button></div><button className="send-button" onClick={handleSubmit} disabled={isThinking || !message.trim()}>{isThinking ? <Loader2 size={15} className="spin" /> : <Send size={15} />} {isThinking ? "Thinking" : "Run"}</button></div></div><div className="suggestions"><span>TRY ASKING</span>{suggestedPrompts.map((prompt) => <button key={prompt} onClick={() => runPrompt(prompt)}>{prompt}<ArrowUpRight size={13} /></button>)}</div>
              </div>
              <aside className="inspector-column"><div className="panel trace-panel"><div className="panel-heading"><div><span className="eyebrow">RUN TRACE / {isThinking ? "STREAMING" : "00:02.41"}</span><h2>How this answer formed</h2></div><Pill tone="lime">{isThinking ? "running" : "passed"}</Pill></div><div className="trace-list"><div className="trace-step done"><span className="trace-number">01</span><div><strong>Intent classified</strong><small>research_question · confidence 0.98</small></div><Check size={14} /></div><div className="trace-step done"><span className="trace-number">02</span><div><strong>Sources retrieved</strong><small>{liveSources.length} chunks passed reranker</small></div><Check size={14} /></div><div className="trace-step done"><span className="trace-number">03</span><div><strong>Claim verification</strong><small>grounding guard enabled</small></div><Check size={14} /></div><div className="trace-step"><span className="trace-number">04</span><div><strong>Action suggested</strong><small>experiment.create · awaiting approval</small></div><button className="mini-run" onClick={() => toast.success("Action staged", { description: "No external change was made." })}><ArrowUpRight size={13} /></button></div></div><div className="trace-foot"><Clock3 size={14} /> server stream <span>·</span> citations attached <span>·</span> safe mode</div></div><div className="panel sources-panel"><div className="panel-heading"><div><span className="eyebrow">EVIDENCE TRAIL</span><h2>Sources used</h2></div><button className="toggle-button" onClick={() => setShowSources(!showSources)}>{showSources ? "Hide" : "Show"}</button></div>{showSources && <div className="source-list">{liveSources.map((source, index) => <div className="source-item" key={`${source.label}-${index}`}><div className="source-index">0{index + 1}</div><div><strong>{source.label}</strong><small>{source.detail}</small></div><span className={`source-kind ${source.kind.toLowerCase()}`}>{source.kind}</span></div>)}</div>}<button className="view-evidence" onClick={() => toast("Evidence inspector", { description: "Open a citation to inspect the exact chunk and score." })}>Open evidence inspector <ArrowUpRight size={14} /></button></div><div className="panel workflow-panel"><div className="workflow-head"><div className="workflow-icon"><Zap size={15} /></div><div><span className="eyebrow">TOOL CALLING</span><strong>Experiment brief</strong></div><Pill tone="amber">approval</Pill></div><p>Turn the recommendation into a ready-to-review brief with owner, audience, hypothesis, and success metric.</p><button className="secondary-button full" onClick={() => toast("Brief staged", { description: "Review it before sending to your team." })}>Review action <ArrowUpRight size={14} /></button></div></aside>
            </div>
          </section>
        )}
        <footer className="app-footer"><span><span className="status-dot small"></span> All systems operational</span><span>OpenAI API · PostgreSQL · FastAPI</span><span><a href="https://github.com/priyavellanki216/ai-workbench" target="_blank" rel="noreferrer">GitHub</a> · <a href="https://github.com/priyavellanki216/ai-workbench#architecture" target="_blank" rel="noreferrer">Architecture</a> · <a href="https://github.com/priyavellanki216/ai-workbench#demo" target="_blank" rel="noreferrer">Demo video</a></span></footer>
      </main>
    </div>
  );
}
