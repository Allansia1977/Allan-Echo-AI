
import React, { useState, useEffect, useRef } from 'react';
import { Memo, ProcessingStatus, Tab, LogEntry } from './types';
import Recorder from './components/Recorder';
import MemoCard from './components/MemoCard';
import Translator from './components/Translator';
import { transcribeAudio, summarizeTranscript } from './services/geminiService';

const App: React.FC = () => {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  const [activeTab, setActiveTab] = useState<Tab>('translate');
  const [isDecoyMode, setIsDecoyMode] = useState(false);
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  const lastTapRef = useRef<{ count: number; time: number }>({ count: 0, time: 0 });

  const addLog = (entry: Omit<LogEntry, 'id' | 'timestamp'>) => {
    const newLog: LogEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    setLogs(prev => [newLog, ...prev].slice(0, 50)); // Keep last 50
    console.log(`[${entry.source}] ${entry.message}`, entry.details);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('echo_mind_memos');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const cleaned = parsed.map((m: Memo) => 
          m.isProcessing ? { ...m, isProcessing: false, error: true, summary: "Processing interrupted" } : m
        );
        setMemos(cleaned);
      } catch (e) {
        addLog({ type: 'ERROR', source: 'System', message: 'Failed to load memos from storage' });
      }
    }
  }, []);

  useEffect(() => {
    try {
      const toSave = memos.map(m => 
        m.isProcessing ? { ...m, isProcessing: false, error: true, summary: "Processing failed" } : m
      );
      localStorage.setItem('echo_mind_memos', JSON.stringify(toSave));
    } catch (e) {
      addLog({ type: 'WARNING', source: 'Storage', message: 'Storage limit reached' });
    }
  }, [memos]);

  const requestPermission = async () => {
    try {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setHasMicPermission(true);
      addLog({ type: 'INFO', source: 'Permission', message: 'Microphone access granted' });
    } catch (err: any) {
      setHasMicPermission(false);
      addLog({ type: 'ERROR', source: 'Permission', message: err.message || 'Mic access denied' });
    }
  };

  const handleTripleTap = (e: React.MouseEvent | React.TouchEvent) => {
    if (e.type === 'click') e.preventDefault();
    const now = Date.now();
    const { count, time } = lastTapRef.current;
    if (now - time < 400) {
      const newCount = count + 1;
      if (newCount >= 3) {
        setIsDecoyMode(false);
        lastTapRef.current = { count: 0, time: 0 };
      } else {
        lastTapRef.current = { count: newCount, time: now };
      }
    } else {
      lastTapRef.current = { count: 1, time: now };
    }
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64String = result.split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleRecordingComplete = async (blob: Blob, duration: number) => {
    if (duration < 0.2 && blob.size === 0) return;
    const memoId = crypto.randomUUID();
    const cleanMimeType = blob.type.split(';')[0];
    addLog({ type: 'INFO', source: 'Recorder', message: 'Processing new memo', details: { size: blob.size, mime: cleanMimeType, duration } });
    
    try {
      const base64 = await blobToBase64(blob);
      const initialMemo: Memo = {
        id: memoId,
        timestamp: Date.now(),
        audioBase64: base64,
        mimeType: cleanMimeType,
        transcript: 'Analysing voice patterns...',
        summary: 'Gemini is thinking...',
        duration: duration || 1,
        isProcessing: true
      };
      setMemos(prev => [initialMemo, ...prev]);
      setStatus(ProcessingStatus.TRANSCRIBING);
      if (!isDecoyMode) setActiveTab('library');
      
      const transcript = await transcribeAudio(base64, cleanMimeType);
      setMemos(prev => prev.map(m => m.id === memoId ? { ...m, transcript } : m));
      
      setStatus(ProcessingStatus.SUMMARIZING);
      const summary = await summarizeTranscript(transcript);
      setMemos(prev => prev.map(m => m.id === memoId ? { ...m, summary, isProcessing: false } : m));
      
      setStatus(ProcessingStatus.IDLE);
      addLog({ type: 'INFO', source: 'Cloud', message: 'Memo processed successfully' });
    } catch (err: any) {
      addLog({ type: 'ERROR', source: 'Cloud', message: err.message || 'Memo processing failed', details: err });
      setStatus(ProcessingStatus.ERROR);
      setMemos(prev => prev.map(m => m.id === memoId ? { ...m, isProcessing: false, error: true, summary: "Cloud processing error." } : m));
      setTimeout(() => setStatus(ProcessingStatus.IDLE), 3000);
    }
  };

  const deleteMemo = (id: string) => {
    setMemos(prev => prev.filter(m => m.id !== id));
  };

  if (hasMicPermission === false || hasMicPermission === null) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-950 px-8 text-center">
        <div className="w-20 h-20 bg-indigo-500/20 rounded-3xl flex items-center justify-center mb-6 animate-pulse">
           <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-20a3 3 0 00-3 3v10a3 3 0 003 3 3 3 0 003-3V5a3 3 0 00-3-3z" />
            </svg>
        </div>
        <h1 className="text-2xl font-black text-white mb-2 tracking-tight">System Ready</h1>
        <p className="text-slate-500 text-sm mb-8 leading-relaxed">AllanEcho AI requires microphone access to process your voice memos and translations.</p>
        <button 
          onClick={requestPermission}
          className="w-full max-w-xs bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl shadow-xl shadow-indigo-500/20 transition-all active:scale-95"
        >
          Initialize AI Core
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden select-none touch-none">
      {isDecoyMode && (
        <div 
          onClick={handleTripleTap}
          className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center select-none touch-none animate-in fade-in duration-500"
        >
          <div className="text-center pointer-events-none">
            <div className="text-6xl font-light text-slate-400 tracking-tighter mb-2">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
            </div>
            <div className="text-xs uppercase font-medium text-slate-600 tracking-[0.3em]">
              {currentTime.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
          </div>
        </div>
      )}

      {showLogs && (
        <div className="fixed inset-0 z-[110] bg-slate-950/95 backdrop-blur-xl flex flex-col p-6 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.4503-.4503l-7 4A1 1 0 004 7v10a1 1 0 001 1h10a1 1 0 001-1V7a1 1 0 00-.605-.911l-3-1.536z" clipRule="evenodd" />
              </svg>
              System Logs
            </h2>
            <button onClick={() => setShowLogs(false)} className="p-2 text-slate-500 hover:text-white">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 font-mono">
            {logs.length === 0 ? (
              <p className="text-slate-600 text-center py-20">No system events logged.</p>
            ) : (
              logs.map(log => (
                <div key={log.id} className={`p-3 rounded-xl border ${log.type === 'ERROR' ? 'bg-red-500/10 border-red-500/20' : 'bg-slate-900 border-slate-800'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${log.type === 'ERROR' ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                      {log.type}
                    </span>
                    <span className="text-[8px] text-slate-600">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-300 font-bold mb-1">[{log.source}] {log.message}</div>
                  {log.details && (
                    <div className="text-[8px] text-slate-500 break-all bg-black/40 p-1.5 rounded">
                      {JSON.stringify(log.details, null, 2)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          <button 
            onClick={() => setLogs([])}
            className="mt-6 w-full py-3 bg-slate-900 text-slate-400 text-[10px] font-black uppercase tracking-widest rounded-xl border border-slate-800"
          >
            Clear Console
          </button>
        </div>
      )}

      <header className="flex-none max-w-xl w-full mx-auto px-6 pt-[env(safe-area-inset-top,44px)] pb-1 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-20a3 3 0 00-3 3v10a3 3 0 003 3 3 3 0 003-3V5a3 3 0 00-3-3z" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-100 flex items-baseline gap-1.5 tracking-tight">
              AllanEcho AI 
            </h1>
            <p className="text-[6px] text-slate-500 font-black uppercase tracking-[0.2em]">Neural Intelligence</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {status !== ProcessingStatus.IDLE && (
            <div className={`flex items-center gap-1.5 text-[7px] font-bold px-2 py-0.5 rounded-full border shadow-xl animate-pulse ${status === ProcessingStatus.ERROR ? 'bg-red-500 text-white border-red-400' : 'text-indigo-400 bg-slate-900 border-slate-800'}`}>
              <div className={`w-1 h-1 rounded-full animate-ping ${status === ProcessingStatus.ERROR ? 'bg-white' : 'bg-indigo-500'}`}></div>
              {status}
            </div>
          )}
          
          <button 
            onClick={() => setShowLogs(true)} 
            className={`p-2 transition-all ${logs.some(l => l.type === 'ERROR') ? 'text-red-500 animate-pulse' : 'text-slate-600 hover:text-slate-400'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </button>

          <button onClick={() => setIsDecoyMode(true)} className="p-2 text-slate-600 hover:text-slate-400 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </button>
        </div>
      </header>

      <main className={`flex-1 overflow-y-auto no-scrollbar max-w-xl w-full mx-auto px-4 ${activeTab === 'translate' ? 'overflow-hidden flex flex-col' : 'pb-32'}`}>
        {activeTab === 'translate' && (
          <div className="flex-1 flex flex-col min-h-0 animate-in fade-in slide-in-from-bottom-4 duration-400">
             <Translator status={status} setStatus={setStatus} addLog={addLog} />
          </div>
        )}

        {activeTab === 'record' && (
          <div className="h-full flex flex-col items-center justify-center space-y-4 animate-in fade-in zoom-in-95 duration-500">
            <Recorder onRecordingComplete={handleRecordingComplete} status={status} addLog={addLog} />
          </div>
        )}

        {activeTab === 'library' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-400">
            <div className="mb-3 flex items-center justify-between px-2 pt-2">
              <h2 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Storage</h2>
              <span className="text-[9px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">{memos.length} FILES</span>
            </div>
            <div className="space-y-2 pb-6">
              {memos.length === 0 ? (
                <div className="text-center py-16 bg-slate-900/30 rounded-3xl border border-dashed border-slate-800">
                  <p className="text-slate-600 text-xs font-medium">Memory bank empty.</p>
                </div>
              ) : (
                memos.map(memo => (
                  <MemoCard key={memo.id} memo={memo} onDelete={deleteMemo} />
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 bg-slate-900/80 rounded-3xl p-6 border border-slate-800 mt-2">
            <h2 className="text-base font-bold text-slate-100 mb-1">Configuration</h2>
            <p className="text-slate-500 text-[10px] mb-4 uppercase tracking-widest">Optimized for iPhone 16 Pro Max</p>
            <div className="p-3 bg-slate-950/50 rounded-xl flex justify-between items-center border border-slate-800/50">
                <span className="text-[10px] font-semibold text-slate-400">Cache Usage</span>
                <span className="text-[9px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded-lg border border-indigo-500/20">~{(memos.length * 0.25).toFixed(1)} MB</span>
            </div>
          </div>
        )}
      </main>
      
      <footer className="flex-none bg-slate-950/95 backdrop-blur-3xl border-t border-slate-900/50 flex items-center justify-around z-50 px-2 pt-1.5 pb-[calc(max(1rem,env(safe-area-inset-bottom))+16px)] shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        <button onClick={() => setActiveTab('translate')} className={`flex flex-col items-center gap-0.5 transition-all flex-1 relative ${activeTab === 'translate' ? 'text-indigo-400' : 'text-slate-600'}`}>
          {activeTab === 'translate' && <div className="absolute -top-1.5 w-8 h-0.5 bg-indigo-500 rounded-full shadow-[0_0_12px_#6366f1]"></div>}
          <div className="p-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
            </svg>
          </div>
          <span className="text-[6px] font-black uppercase tracking-widest">Translate</span>
        </button>

        <button onClick={() => setActiveTab('record')} className={`flex flex-col items-center gap-0.5 transition-all flex-1 relative ${activeTab === 'record' ? 'text-indigo-400' : 'text-slate-600'}`}>
          {activeTab === 'record' && <div className="absolute -top-1.5 w-8 h-0.5 bg-indigo-500 rounded-full shadow-[0_0_12px_#6366f1]"></div>}
          <div className="p-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-20a3 3 0 00-3 3v10a3 3 0 003 3 3 3 0 003-3V5a3 3 0 00-3-3z" />
            </svg>
          </div>
          <span className="text-[6px] font-black uppercase tracking-widest">Memo</span>
        </button>
        
        <button onClick={() => setActiveTab('library')} className={`flex flex-col items-center gap-0.5 transition-all flex-1 relative ${activeTab === 'library' ? 'text-indigo-400' : 'text-slate-600'}`}>
          {activeTab === 'library' && <div className="absolute -top-1.5 w-8 h-0.5 bg-indigo-500 rounded-full shadow-[0_0_12px_#6366f1]"></div>}
          <div className="p-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </div>
          <span className="text-[6px] font-black uppercase tracking-widest">Library</span>
        </button>
        
        <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center gap-0.5 transition-all flex-1 relative ${activeTab === 'settings' ? 'text-indigo-400' : 'text-slate-600'}`}>
          {activeTab === 'settings' && <div className="absolute -top-1.5 w-8 h-0.5 bg-indigo-500 rounded-full shadow-[0_0_12px_#6366f1]"></div>}
          <div className="p-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            </svg>
          </div>
          <span className="text-[6px] font-black uppercase tracking-widest">Config</span>
        </button>
      </footer>
    </div>
  );
};

export default App;
