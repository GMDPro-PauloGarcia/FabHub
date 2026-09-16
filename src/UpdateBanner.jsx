import React from 'react';
import { supabase, isSupabaseReady } from './supabaseClient';

// Update banner — tells the team when a new version / data cleanup has been
// published and prompts a reload. Driven by the single-row `app_release` table
// in Supabase: bump that row (version + notes) after a deploy and every open
// client shows this banner within ~2 minutes (and immediately on window focus).
//
// Deliberately self-contained and defensive: it is mounted as a SIBLING of
// <App/> in index.js, reads one tiny row, and wraps every async path in
// try/catch so it can NEVER break or block the app. Worst case it silently
// shows nothing. There is no service worker, so window.location.reload() always
// fetches the freshly deployed code — and the reload also flushes the browser's
// stale local cache, which is what stops voided/deleted records from being
// re-uploaded ("resurrected") by an out-of-date tab.
export default function UpdateBanner() {
  const [latest, setLatest] = React.useState(null);   // {version, notes} newer than booted
  const bootedVersion = React.useRef(null);           // version seen on first load
  const dismissed = React.useRef(null);               // version the user dismissed

  React.useEffect(() => {
    if (!isSupabaseReady()) return;
    let alive = true;

    const check = async () => {
      try {
        const { data, error } = await supabase
          .from('app_release')
          .select('version, notes')
          .eq('id', 1)
          .maybeSingle();
        if (error || !data || !data.version || !alive) return;
        // First successful read establishes the baseline — never banner on boot.
        if (bootedVersion.current == null) { bootedVersion.current = data.version; return; }
        if (data.version !== bootedVersion.current && data.version !== dismissed.current) {
          setLatest({ version: data.version, notes: data.notes || '' });
        }
      } catch (_) { /* fail silent — never break the app over a banner */ }
    };

    check();
    const iv = setInterval(check, 120000); // every 2 minutes
    const onFocus = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => { alive = false; clearInterval(iv); document.removeEventListener('visibilitychange', onFocus); window.removeEventListener('focus', onFocus); };
  }, []);

  if (!latest) return null;

  const reload = () => { try { window.location.reload(); } catch (_) {} };
  const close = () => { dismissed.current = latest.version; setLatest(null); };

  return (
    <div style={{position:'fixed',top:0,left:0,right:0,zIndex:99999,background:'#4338ca',color:'#fff',
      boxShadow:'0 2px 12px rgba(0,0,0,.25)',fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
      <div style={{maxWidth:1100,margin:'0 auto',padding:'10px 16px',display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
        <span style={{fontSize:'1.1rem',lineHeight:1}}>🔄</span>
        <div style={{flex:1,minWidth:200}}>
          <div style={{fontWeight:800,fontSize:'.9rem'}}>FabHub was updated ({latest.version})</div>
          {latest.notes && <div style={{fontSize:'.78rem',opacity:.9,marginTop:2}}>{latest.notes}</div>}
        </div>
        <button onClick={reload} style={{background:'#fff',color:'#4338ca',border:'none',borderRadius:8,
          padding:'8px 18px',fontWeight:800,fontSize:'.82rem',cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap'}}>
          Reload now
        </button>
        <button onClick={close} aria-label="Dismiss" style={{background:'transparent',color:'#c7d2fe',border:'none',
          fontSize:'1.1rem',cursor:'pointer',lineHeight:1,padding:'4px 6px'}}>✕</button>
      </div>
    </div>
  );
}
