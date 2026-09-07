import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { logClientError } from './supabaseClient';

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  componentDidCatch(e, info) { console.error('[FabHub crash]', e, info); try { logClientError(e, info, 'boot'); } catch (_) {} }
  render() {
    if (this.state.error) {
      return (
        <div style={{minHeight:'100vh',background:'#0f172a',display:'flex',alignItems:'center',justifyContent:'center',padding:24,fontFamily:"'Segoe UI',sans-serif"}}>
          <div style={{background:'#1e293b',borderRadius:16,padding:32,maxWidth:560,width:'100%',border:'1.5px solid #ef4444'}}>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:'1.4rem',color:'#ef4444',marginBottom:8}}>Something went wrong</div>
            <div style={{color:'#94a3b8',fontSize:'.85rem',marginBottom:16}}>FabHub encountered an unexpected error. Please copy the message below and send it to Paulo.</div>
            <pre style={{background:'#0f172a',borderRadius:8,padding:14,fontSize:'.75rem',color:'#fca5a5',overflowX:'auto',whiteSpace:'pre-wrap',wordBreak:'break-all'}}>{this.state.error?.message || String(this.state.error)}{'\n\n'}{this.state.error?.stack}</pre>
            <button onClick={()=>window.location.reload()} style={{marginTop:16,background:'#6366f1',border:'none',borderRadius:8,padding:'10px 24px',color:'#fff',fontWeight:700,fontSize:'.88rem',cursor:'pointer',fontFamily:'inherit'}}>↺ Reload App</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Global safety net for errors OUTSIDE React render ────────────────────────
// React error boundaries only catch errors thrown during render/lifecycle. An
// error in an async callback, an event handler, or a rejected promise escapes
// them and would otherwise vanish silently. These two listeners route those
// into the same fail-safe telemetry (logClientError never throws), so a crash
// that doesn't blank the UI is still visible instead of invisible. They only
// observe — they never preventDefault, so the browser console still shows the
// error and nothing about existing behavior changes.
if (typeof window !== 'undefined') {
  window.addEventListener('error', (ev) => {
    try { logClientError(ev?.error || new Error(ev?.message || 'window.onerror'), null, 'window.error'); } catch (_) {}
  });
  window.addEventListener('unhandledrejection', (ev) => {
    try {
      const r = ev?.reason;
      logClientError(r instanceof Error ? r : new Error(typeof r === 'string' ? r : 'Unhandled promise rejection'), null, 'unhandledrejection');
    } catch (_) {}
  });
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ErrorBoundary><App /></ErrorBoundary>);
