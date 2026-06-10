import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  componentDidCatch(e, info) { console.error('[FabHub crash]', e, info); }
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

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ErrorBoundary><App /></ErrorBoundary>);
