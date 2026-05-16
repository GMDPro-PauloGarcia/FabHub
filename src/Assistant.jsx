import { useState, useRef, useEffect } from "react";

const ROLES = ["Manager","Sales","Finance","Operations","Design"];
const ROLE_CLR = { Manager:"#f59e0b",Sales:"#10b981",Finance:"#3b82f6",Operations:"#f97316",Design:"#8b5cf6" };

// ─── GMD SYSTEM CONTEXT ───────────────────────────────────────────────────────
// Full knowledge base loaded from uploaded documents
const GMD_SYSTEM_PROMPT = `You are the GMD Productions AI Assistant — an internal tool for the GMD Productions Inc. team in the Philippines. You know everything about GMD's business, pricing, clients, protocol, and workflow.

ABOUT GMD PRODUCTIONS INC.
- Retail fabrication and design-and-build company based in the Philippines
- Specializes in: custom shelving, display fixtures, signage, countertops, retail cabinetry, kiosks, wall panels, millwork, POP displays, and full retail interior fit-outs
- Also handles construction projects (civil, structural, MEP)
- Currency: Philippine Pesos (₱)

THE TEAM
- Paulo Garcia — Director/Owner. FINAL authority on all pricing, discounts, and final quotes. Mandatory gate for Stage 04 and Stage 05. Steps in only for contract-level escalations.
- Paolo Gomez — Sales Manager. READY to fully own difficult clients. Can ballpark-quote ranges to clients but CANNOT commit pricing without Paulo for ₱3M+ projects.
- Gail De Ello — Account Executive. Training phase. Routine client comms. Problems go to Paolo.
- Jena De Asis — Junior Account Executive. Training phase. Updates and coordination. Escalate to Gail or Paolo.
- Wyn Celmar — Sales Admin. Administrative support. Tracks timelines and document status.
- Rodney — QS/CE (Quantity Surveyor). Primary construction estimator. Prepares CE using enhanced template.
- Jerome Mendoza — External, on-call CE backup for construction. Used only when Rodney is unavailable and urgent CE required.
- Mar (Paulo's wife) — Finance Manager/Marketing Consultant.

GMD 11-STAGE PIPELINE
Stage 01 — Client Acquisition: Sales secures client, flags project type (Fabrication vs Construction)
Stage 02 — Client Briefing: Client submits brief. Sales documents scope, specs, timeline, budget.
Stage 03 — CE Drafting: Sales Team (Fabrication/General) OR Rodney (Construction). Jerome on-call backup.
Stage 04 — Paulo Review & Final Quote: MANDATORY PAULO GATE. Paulo reviews all CEs, applies % adjustments, sets discount. Produces final CE showing base + discounted quote.
Stage 05 — 4-Way Sign-Off: Paulo + Sales Mgr + Finance + Dir BizDev all sign before client transmission.
Stage 06 — Signed CE/PO: Sales sends to client. Finance tags project on receipt.
Stage 07 — Initial Billing: Finance bills client per agreed terms.
Stage 08 — Production/Fabrication: GMD executes. Milestones logged.
Stage 09 — Delivery & Punchlist: GMD delivers, resolves punchlist, client signs delivery receipt.
Stage 10 — Progress/Balance Billing: Finance issues remaining or final invoice.
Stage 11 — Project Close-Out: Payments collected, documents filed, project closed.

CRITICAL RULES
1. ₱3M RULE: Any project at or above ₱3,000,000 REQUIRES Paulo Garcia's direct involvement. Paolo can ballpark-quote ranges to clients but CANNOT commit pricing without Paulo.
2. PAULO GATES: Stage 04 (Paulo Review) and Stage 05 (4-Way Sign-Off) are mandatory gates. No project advances without Paulo's sign-off.
3. DISCOUNT RULE: Only Paulo Garcia sets discounts and final quote amounts. Sales team does NOT adjust pricing.
4. CONSTRUCTION CE: Rodney (QS/CE) is primary. Jerome Mendoza is external, on-call backup only.

SALES PROTOCOL — KEY RULES
GOLDEN RULE: Clients should NEVER have to ask "Any update?" — ever.
RESPONSE TIME: 15 minutes during work hours (8:00 AM to 5:00 PM).
AFTER HOURS: Messages after 5 PM acknowledged next morning before 8:30 AM.

WHAT SALES TEAM CAN DECIDE WITHOUT PAULO:
- Setting timelines with operations
- Design approvals within client brief
- Drafting and sending client updates
- Scheduling site visits and walkthroughs
- Coordinating backjob schedules
- Responding to routine complaints

ALWAYS ESCALATE TO PAULO:
- Discounts or pricing adjustments
- Contract disputes or legal concerns
- Client threatening to cancel
- New project negotiations or deal closing
- Budget changes

THE INCIDENT RULE (China Trip): If a team is scheduled for early morning delivery/installation — Account Executive confirms the night before AND again at 5 AM. If the team cannot make it, the client is CALLED IMMEDIATELY — never left waiting.

PROBLEM ESCALATION: Always present a SOLUTION, not just a problem.
DON'T SAY: "Sir, may problema kami sa delivery."
DO SAY: "Sir, may delay. Two options: (1) reschedule tomorrow 6am, or (2) partial delivery tonight. Which do you prefer?"

PAULO'S ROLE SHIFT — OPERATOR TO COACH:
Paulo is transitioning from doing everything himself to coaching his team to own results. He should NOT:
- Jump in when a client is unhappy (brief Paolo, let him handle it)
- Approve every design before client sees it
- Respond directly in client group chats
- Rescue team from consequences of mistakes

GMD PRICING STRUCTURE
How a GMD quote is built:
Layer 1: Material Costs (Engr. Rodney / Cost Library) — includes buffer/wastage allowance
Layer 2: Labor Costs (trade labor at day rates — Engineer ₱1,000/day, Foreman ₱900, Skilled Worker ₱800, Helper ₱650)
Layer 3: Tools, Equipment & Safety
Layer 4: Contractor's Profit (CP) — 20% applied on top of items 1-3
TOTAL MARGIN RESULT: Items 1-3 carry material markup + 20% CP = ~50-60% total margin (Paulo confirmed)

STANDARD LINE ITEMS (always include for mall projects):
- Mobilization/Demobilization: ₱150,000–350,000 (non-negotiable, always on every project)
- Project Engineer (Supervision): ₱70,000–90,000
- Safety Officer: ₱35,000–90,000 (required by most malls)
- Board Down/Temp Protection: ₱25,000–55,000
- Tools & Equipment Rental: ₱25,000–65,000
- CARI (Mall Admin): ₱20,000–25,000 (mandatory for mall projects)
- Working/Shop Drawings: ₱25,000–65,000
- As-Built Plans: ₱20,000–25,000 per set (typically 4 sets)
- Delivery/Hauling: ₱25,000–50,000
- Temporary Power: ₱5,000–15,000

CONFIRMED LABOR RATES (Engr. Rodney, per day 8 hours):
- Engineer/Architect (Site): ₱1,000/day, OT ₱156.25/hr
- Foreman: ₱900/day, OT ₱140.63/hr
- Skilled Worker (Carpenter, Tiler, etc.): ₱800/day, OT ₱125.00/hr
- Helper/General Labor: ₱650/day, OT ₱101.56/hr
Night differential (+10%) applies 10PM–6AM. Holiday rates: 200% regular, 260% OT.
Productivity benchmarks: Tiling 8sqm/day | Painting 20sqm/day | Drywall 4 boards/day | Ceiling 8sqm/day.

PROJECT BENCHMARKS (actual awarded projects — GMD Project Library v1.0):
- Modules + Signage (Activation): ₱1.0M–1.5M (ref: Treasure Pop-Up at MOA)
- Fit-Out + Built-ins (Mid): ₱3.5M–4.5M (ref: STNT, Popmart Cebu ₱4.62M, Popmart Davao ₱4.67M)
- Full Retail Interior (~100sqm): ₱5.0M–6.5M | ~₱55,000–60,000/sqm (ref: BTV Shangri-La ₱5.72M / ₱56,200 per sqm; BTV Cebu ₱5.94M / ₱58,900 per sqm)
- Full Retail Multi-Brand/Complex: ₱7.0M–8.5M (ref: OPPENP ₱7.22M awarded — PAULO REQUIRED)
- F&B Fit-Out: TBC (ref: KUBO Coffee — includes exhaust, hood provisions)

IMPORTANT BENCHMARK NOTES:
- BTV benchmark = ₱55,000–60,000/sqm applies to premium fashion retail interior (~100sqm)
- STNT was ₱3.75M on ~32sqm selling area = ₱117K/sqm on small scope (different calculation basis)
- Popmart Cebu and Davao nearly identical (₱50K difference) — confirms Popmart-type = ₱4.6M–4.7M consistently
- OPPENP largest in library at ₱7.22M (2 brands, same space)

CURRENT ACTIVE PROJECTS (as of 2026):
1. ABC Retail Corp — Retail Fit-Out SM Megamall | CE-2026-001 | ₱3,040,000 (5% disc) | Stage 08 Production | Delivery May 20
2. XYZ Holdings — Office Renovation BGC Tower | CE-2026-002 | ₱1,242,000 (8% disc) | Stage 05 4-Way Sign-Off — PENDING
3. MNO Brands Inc. — Showroom Quezon Ave | CE-2026-003 | ₱980,000 | Stage 04 Paulo Review
4. PQR Development — Commercial Building Phase 1 | CE-2026-004 | ₱8,500,000 (CONSTRUCTION) | Stage 04 Paulo Review — Rodney template submitted
5. STU Events Co. — Event Booth Manila FAME | Stage 02 Briefing | Brief expected May 15

OPEN BALANCES (URGENT — FOLLOW UP):
- Ivory Tree Inc. (Studio Ceremonie Opus): ₱2,611,200 OUTSTANDING — already at Stage 10 Balance Billing
- Newtrends International (Watch Republic Ayala Center Cebu): ₱240,000 OUTSTANDING
- Five Sips and Swallows (Kubo Coffee Roasters): ₱84,000 OUTSTANDING

GMD CLIENT BASE: 207 parent companies, 434 total records in the system.

WHAT'S NOT YET IN THE SYSTEM:
- Construction project benchmarks (no awarded construction BOQs yet)
- Rate card unit prices pending QS validation vs live supplier prices
- KUBO final awarded total (multiple revisions — confirm with Engr. Rodney)
- Sub-con day rates (not yet documented)
- F&B benchmark per sqm (only one F&B project)

YOUR BEHAVIOR AS GMD ASSISTANT:
- Be direct and practical. Paulo's style is no-nonsense.
- Always flag when something needs Paulo's attention (₱3M+, Stage 04/05, pricing changes, contract issues)
- For Sales questions: coach on protocol, draft client messages, flag escalation triggers
- For Finance questions: surface open balances, flag overdue accounts, calculate project margins
- For Operations questions: help track stages, materials, and team assignments
- For Design questions: help track design status and deliverables
- When giving estimates: always reference actual GMD benchmarks, not guesses
- Always speak in Philippine Pesos (₱)
- Keep responses focused and actionable — the team is busy`;

// ─── QUICK PROMPTS PER ROLE ────────────────────────────────────────────────────
const QUICK_PROMPTS = {
  Manager: [
    "What projects need my attention today?",
    "Which open balances should I follow up?",
    "What's our total pipeline value right now?",
    "Summarize the current collection status",
    "Which projects are at the Paulo gate?",
  ],
  Sales: [
    "How should I follow up on a client who hasn't responded?",
    "Draft a proactive update message for a client",
    "When do I need to escalate to Paolo?",
    "What's our ballpark for a ~100sqm retail fit-out?",
    "Client is unhappy with a delay — what do I say?",
  ],
  Finance: [
    "Which accounts have open balances?",
    "What are the outstanding collections?",
    "How is GMD's margin structured?",
    "What should be on every mall project invoice?",
    "Summarize current billing status by project",
  ],
  Operations: [
    "What are the current project stages?",
    "What are the confirmed labor day rates?",
    "What standard line items must be in every mall project?",
    "What productivity benchmarks should we plan for?",
    "How do I calculate a project timeline?",
  ],
  Design: [
    "What design stages are pending approval?",
    "When should design escalate to Paulo?",
    "What's the standard design workflow for a fit-out?",
    "Which projects are currently in Design phase?",
    "What deliverables are needed before production?",
  ],
};

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function GMDAssistant() {
  const [role,    setRole]   = useState(null);
  const [msgs,    setMsgs]   = useState([]);
  const [input,   setInput]  = useState("");
  const [loading, setLoading]= useState(false);
  const [error,   setError]  = useState("");
  const bottomRef = useRef(null);

  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); },[msgs]);

  const pickRole = r => {
    setRole(r);
    setMsgs([{
      role:"assistant",
      content:`Good day! I'm the GMD Productions AI Assistant. You're logged in as **${r}**.\n\nI know your Sales Protocol, project pipeline, pricing benchmarks, client list, and open balances. Ask me anything about GMD's business.\n\nSome things I can help with:\n${QUICK_PROMPTS[r].map(q=>`• ${q}`).join("\n")}`
    }]);
  };

  const send = async (text) => {
    const q = text || input.trim();
    if(!q || loading) return;
    setInput("");
    setError("");

    const userMsg  = { role:"user", content:q };
    const newMsgs  = [...msgs, userMsg];
    setMsgs(newMsgs);
    setLoading(true);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: GMD_SYSTEM_PROMPT + `\n\nThe person currently logged in is: ${role}. Tailor your responses to their role and what they need most. Be practical and action-oriented.`,
          messages: newMsgs.map(m=>({role:m.role,content:m.content})),
        })
      });
      const data = await res.json();
      if(data.error) throw new Error(data.error.message);
      const reply = data.content?.[0]?.text || "No response received.";
      setMsgs(m=>[...m,{role:"assistant",content:reply}]);
    } catch(e) {
      setError("Connection error. Please try again.");
      setMsgs(m=>m.slice(0,-1));
      setInput(q);
    }
    setLoading(false);
  };

  const handleKey = e => { if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); send(); } };

  const fmt_msg = (text) => {
    // Simple markdown-like formatting
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/•\s/g, '<span style="margin-right:6px">•</span>')
      .split('\n').join('<br/>');
  };

  // ── Role picker ─────────────────────────────────────────────────────────────
  if(!role) return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%)",display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Barlow:wght@400;500;600;700&display=swap'); *{box-sizing:border-box;}`}</style>
      <div style={{width:"100%",maxWidth:460}}>
        <div style={{textAlign:"center",marginBottom:40}}>
          <div style={{fontFamily:"'DM Serif Display',serif",fontSize:"2.4rem",color:"#fff",letterSpacing:-.5,marginBottom:8}}>
            GMD <span style={{color:"#f59e0b",fontStyle:"italic"}}>Assistant</span>
          </div>
          <div style={{color:"rgba(255,255,255,.5)",fontSize:".9rem"}}>Your AI-powered business advisor</div>
          <div style={{color:"rgba(255,255,255,.3)",fontSize:".78rem",marginTop:4}}>Knows your protocol, pricing, clients, and pipeline</div>
        </div>
        {[
          {r:"Manager",   icon:"👑", desc:"Full access — pipeline, finance, collections, strategy", color:"#f59e0b"},
          {r:"Sales",     icon:"🤝", desc:"Deal coaching, client messaging, escalation guidance",   color:"#10b981"},
          {r:"Finance",   icon:"₱",  desc:"Collections, open balances, margins, billing",           color:"#3b82f6"},
          {r:"Operations",icon:"⚙",  desc:"Project stages, labor rates, timeline planning",         color:"#f97316"},
          {r:"Design",    icon:"🎨", desc:"Design workflow, status tracking, deliverables",          color:"#8b5cf6"},
        ].map(({r,icon,desc,color})=>(
          <div key={r} onClick={()=>pickRole(r)}
            style={{background:"rgba(255,255,255,.06)",backdropFilter:"blur(10px)",borderRadius:14,border:"1.5px solid rgba(255,255,255,.1)",padding:"16px 20px",marginBottom:10,cursor:"pointer",display:"flex",alignItems:"center",gap:16,transition:"all .2s"}}
            onMouseEnter={e=>{e.currentTarget.style.background=`rgba(255,255,255,.1)`;e.currentTarget.style.borderColor=color+"88";e.currentTarget.style.transform="translateX(4px)";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,.06)";e.currentTarget.style.borderColor="rgba(255,255,255,.1)";e.currentTarget.style.transform="none";}}>
            <div style={{width:46,height:46,borderRadius:12,background:color+"22",border:`1.5px solid ${color}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.35rem",flexShrink:0}}>{icon}</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:"1rem",color:"#fff"}}>{r}</div>
              <div style={{fontSize:".78rem",color:"rgba(255,255,255,.45)",marginTop:2}}>{desc}</div>
            </div>
            <div style={{color:color,fontSize:"1.2rem",opacity:.7}}>→</div>
          </div>
        ))}
      </div>
    </div>
  );

  const roleColor = ROLE_CLR[role];
  const quickP    = QUICK_PROMPTS[role]||[];

  // ── Chat interface ──────────────────────────────────────────────────────────
  return(
    <div style={{height:"100vh",display:"flex",flexDirection:"column",background:"#0f172a",fontFamily:"'Segoe UI',system-ui,sans-serif",color:"#e2e8f0"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Barlow:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#334155;border-radius:2px}
        @keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
        .thinking span{animation:pulse 1.2s infinite;}
        .thinking span:nth-child(2){animation-delay:.2s}
        .thinking span:nth-child(3){animation-delay:.4s}
        textarea{outline:none;resize:none;}
        textarea:focus{border-color:${roleColor}!important;}
      `}</style>

      {/* Header */}
      <div style={{background:"#161b22",borderBottom:"1px solid #21262d",padding:"12px 20px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
        <div style={{fontFamily:"'DM Serif Display',serif",fontSize:"1.1rem",color:"#fff",flex:1}}>
          GMD <span style={{color:"#f59e0b",fontStyle:"italic"}}>Assistant</span>
        </div>
        <div style={{background:roleColor+"22",border:`1px solid ${roleColor}44`,borderRadius:20,padding:"3px 12px",fontSize:".72rem",fontWeight:700,color:roleColor}}>{role}</div>
        <button onClick={()=>{setRole(null);setMsgs([]);}} style={{background:"transparent",border:"1px solid #21262d",borderRadius:8,padding:"4px 10px",fontSize:".72rem",color:"#64748b",cursor:"pointer",fontFamily:"inherit"}}>Switch</button>
      </div>

      {/* Messages */}
      <div style={{flex:1,overflowY:"auto",padding:"20px",display:"flex",flexDirection:"column",gap:16}}>
        {msgs.map((m,i)=>{
          const isUser = m.role==="user";
          return(
            <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",flexDirection:isUser?"row-reverse":"row"}}>
              {/* Avatar */}
              <div style={{width:34,height:34,borderRadius:"50%",background:isUser?roleColor+"33":"#1e293b",border:`1.5px solid ${isUser?roleColor+"55":"#334155"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:".85rem",flexShrink:0,color:isUser?roleColor:"#94a3b8",fontWeight:700}}>
                {isUser?role[0]:"G"}
              </div>
              {/* Bubble */}
              <div style={{maxWidth:"76%",background:isUser?"#1e3a5f":"#161b22",borderRadius:isUser?"16px 4px 16px 16px":"4px 16px 16px 16px",padding:"12px 16px",border:`1px solid ${isUser?"#1d4ed833":"#21262d"}`,lineHeight:1.65,fontSize:".88rem",color:isUser?"#e2e8f0":"#cbd5e1"}}>
                <div dangerouslySetInnerHTML={{__html:fmt_msg(m.content)}}/>
              </div>
            </div>
          );
        })}

        {/* Loading */}
        {loading&&(
          <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
            <div style={{width:34,height:34,borderRadius:"50%",background:"#1e293b",border:"1.5px solid #334155",display:"flex",alignItems:"center",justifyContent:"center",fontSize:".85rem",color:"#94a3b8",fontWeight:700,flexShrink:0}}>G</div>
            <div style={{background:"#161b22",borderRadius:"4px 16px 16px 16px",padding:"14px 18px",border:"1px solid #21262d"}}>
              <div className="thinking" style={{display:"flex",gap:5,alignItems:"center"}}>
                <span style={{width:7,height:7,borderRadius:"50%",background:roleColor,display:"inline-block"}}>●</span>
                <span style={{width:7,height:7,borderRadius:"50%",background:roleColor,display:"inline-block"}}>●</span>
                <span style={{width:7,height:7,borderRadius:"50%",background:roleColor,display:"inline-block"}}>●</span>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {/* Quick prompts */}
      {msgs.length<=1&&(
        <div style={{padding:"0 20px 12px",display:"flex",gap:8,flexWrap:"wrap",flexShrink:0}}>
          {quickP.map(q=>(
            <button key={q} onClick={()=>send(q)} style={{background:"#1e293b",border:"1px solid #334155",borderRadius:20,padding:"6px 14px",fontSize:".76rem",color:"#94a3b8",cursor:"pointer",fontFamily:"inherit",transition:"all .15s",whiteSpace:"nowrap"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=roleColor;e.currentTarget.style.color=roleColor;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#334155";e.currentTarget.style.color="#94a3b8";}}>
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error&&<div style={{padding:"8px 20px",fontSize:".78rem",color:"#f87171",background:"#1a0a0a",borderTop:"1px solid #3a1010",flexShrink:0}}>{error}</div>}

      {/* Input */}
      <div style={{padding:"12px 20px",borderTop:"1px solid #21262d",background:"#161b22",flexShrink:0}}>
        <div style={{display:"flex",gap:10,alignItems:"flex-end",background:"#0f172a",border:`1.5px solid #21262d`,borderRadius:12,padding:"10px 14px",transition:"border-color .15s"}}
          onFocusCapture={e=>e.currentTarget.style.borderColor=roleColor}
          onBlurCapture={e=>e.currentTarget.style.borderColor="#21262d"}>
          <textarea
            value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={`Ask anything about GMD — pricing, clients, protocol, pipeline…`}
            rows={1}
            style={{flex:1,background:"transparent",border:"none",color:"#e2e8f0",fontFamily:"inherit",fontSize:".88rem",lineHeight:1.5,maxHeight:120,overflowY:"auto"}}
            onInput={e=>{e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,120)+"px";}}
          />
          <button onClick={()=>send()} disabled={!input.trim()||loading}
            style={{background:input.trim()&&!loading?roleColor:"#1e293b",border:"none",borderRadius:8,width:36,height:36,cursor:input.trim()&&!loading?"pointer":"not-allowed",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .15s",color:input.trim()&&!loading?"#fff":"#334155",fontSize:"1rem"}}>
            {loading?"⏳":"↑"}
          </button>
        </div>
        <div style={{fontSize:".66rem",color:"#334155",marginTop:6,textAlign:"center"}}>
          Enter to send · Shift+Enter for new line · Powered by Claude AI
        </div>
      </div>
    </div>
  );
}
