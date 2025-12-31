import React, { useState, useEffect, useRef } from 'react';
import { Memo, ProcessingStatus, Tab } from './types';
import Recorder from './components/Recorder';
import MemoCard from './components/MemoCard';
import Translator from './components/Translator';
import { transcribeAudio, summarizeTranscript } from './services/geminiService';

const App: React.FC = () => {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  const [activeTab, setActiveTab] = useState<Tab>('translate');
  const [isDecoyMode, setIsDecoyMode] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  const lastTapRef = useRef<{ count: number; time: number }>({ count: 0, time: 0 });

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
        console.error("Error loading memos", e);
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
      console.warn("Storage limit might have been reached", e);
    }
  }, [memos]);

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
    } catch (err) {
      console.error("Processing error:", err);
      setStatus(ProcessingStatus.ERROR);
      setMemos(prev => prev.map(m => m.id === memoId ? { ...m, isProcessing: false, error: true, summary: "Cloud processing error." } : m));
      setTimeout(() => setStatus(ProcessingStatus.IDLE), 3000);
    }
  };

  const deleteMemo = (id: string) => {
    setMemos(prev => prev.filter(m => m.id !== id));
  };

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

      <header className="flex-none max-w-xl w-full mx-auto px-6 pt-8 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-20a3 3 0 00-3 3v10a3 3 0 003 3 3 3 0 003-3V5a3 3 0 00-3-3z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100 flex items-baseline gap-1.5">
              AllanEcho AI 
            </h1>
            <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.2em]">Neural Audio Intelligence</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {status !== ProcessingStatus.IDLE && (
            <div className="flex items-center gap-2 text-[9px] font-bold text-indigo-400 bg-slate-900 px-3 py-1.5 rounded-full border border-slate-800 shadow-xl animate-pulse">
              <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-ping"></div>
              {status}
            </div>
          )}
          <button 
            onClick={() => setIsDecoyMode(true)}
            className="p-2 text-slate-500 hover:text-slate-300 transition-colors"
            title="Decoy Mode"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className={`flex-1 overflow-y-auto no-scrollbar max-w-xl w-full mx-auto px-4 pt-2 ${activeTab === 'translate' ? 'pb-6 overflow-hidden' : 'pb-28'}`}>
        {activeTab === 'translate' && (
          <div className="h-full flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-400 overflow-hidden">
             <Translator status={status} setStatus={setStatus} />
          </div>
        )}

        {activeTab === 'record' && (
          <div className="h-full flex flex-col items-center justify-center space-y-6 animate-in fade-in zoom-in-95 duration-500">
            <Recorder onRecordingComplete={handleRecordingComplete} status={status} />
            <div className="w-full bg-slate-900/50 p-5 rounded-3xl border border-slate-800/50 backdrop-blur-sm text-center">
              <h3 className="text-slate-200 text-sm font-semibold mb-1">Neural Core Active</h3>
              <p className="text-slate-500 text-[11px] leading-relaxed max-w-[240px] mx-auto">
                High-efficiency encoding enabled. Voice data is processed with Gemini-3-Flash for rapid summaries.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'library' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-400">
            <div className="mb-4 flex items-center justify-between px-2">
              <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Stored Intelligence</h2>
              <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">{memos.length} ANALYZED</span>
            </div>
            <div className="space-y-3 pb-8">
              {memos.length === 0 ? (
                <div className="text-center py-20 bg-slate-900/30 rounded-3xl border border-dashed border-slate-800">
                  <div className="inline-block p-4 bg-slate-900 rounded-full mb-3 border border-slate-800">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                    </svg>
                  </div>
                  <p className="text-slate-500 text-sm font-medium">Memory bank empty.</p>
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
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 bg-slate-900/80 rounded-3xl p-6 border border-slate-800 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-100 mb-1">System Config</h2>
            <p className="text-slate-500 text-xs mb-6">Optimized for efficient audio storage.</p>
            <div className="space-y-3">
              <div className="p-4 bg-slate-950/50 rounded-2xl flex justify-between items-center border border-slate-800/50">
                <span className="text-xs font-semibold text-slate-400">Total Footprint</span>
                <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-lg border border-indigo-500/20 tracking-tighter">~{(memos.length * 0.25).toFixed(1)} MB</span>
              </div>
            </div>
            <div className="mt-8 text-center">
                <p className="text-[9px] text-slate-700 font-bold uppercase tracking-widest">Version 1.1.0-Dark</p>
            </div>
          </div>
        )}
      </main>
      
      <footer className="flex-none h-24 bg-slate-950/90 backdrop-blur-2xl border-t border-slate-900/50 flex items-center justify-around z-50 px-2 pb-6 touch-auto">
        <button onClick={() => setActiveTab('translate')} className={`flex flex-col items-center gap-1 transition-all flex-1 relative ${activeTab === 'translate' ? 'text-indigo-400 scale-105' : 'text-slate-600 hover:text-slate-400'}`}>
          {activeTab === 'translate' && <div className="absolute -top-1 w-12 h-1 bg-indigo-500 rounded-full shadow-[0_0_10px_#6366f1]"></div>}
          <div className="p-2.5 rounded-2xl">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
            </svg>
          </div>
          <span className="text-[8px] font-black uppercase tracking-widest">Translate</span>
        </button>

        <button onClick={() => setActiveTab('record')} className={`flex flex-col items-center gap-1 transition-all flex-1 relative ${activeTab === 'record' ? 'text-indigo-400 scale-105' : 'text-slate-600 hover:text-slate-400'}`}>
          {activeTab === 'record' && <div className="absolute -top-1 w-12 h-1 bg-indigo-500 rounded-full shadow-[0_0_10px_#6366f1]"></div>}
          <div className="p-2.5 rounded-2xl">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-20a3 3 0 00-3 3v10a3 3 0 003 3 3 3 0 003-3V5a3 3 0 00-3-3z" />
            </svg>
          </div>
          <span className="text-[8px] font-black uppercase tracking-widest">Memo</span>
        </button>
        
        <button onClick={() => setActiveTab('library')} className={`flex flex-col items-center gap-1 transition-all flex-1 relative ${activeTab === 'library' ? 'text-indigo-400 scale-105' : 'text-slate-600 hover:text-slate-400'}`}>
          {activeTab === 'library' && <div className="absolute -top-1 w-12 h-1 bg-indigo-500 rounded-full shadow-[0_0_10px_#6366f1]"></div>}
          <div className="p-2.5 rounded-2xl">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </div>
          <span className="text-[8px] font-black uppercase tracking-widest">Library</span>
        </button>
        
        <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center gap-1 transition-all flex-1 relative ${activeTab === 'settings' ? 'text-indigo-400 scale-105' : 'text-slate-600 hover:text-slate-400'}`}>
          {activeTab === 'settings' && <div className="absolute -top-1 w-12 h-1 bg-indigo-500 rounded-full shadow-[0_0_10px_#6366f1]"></div>}
          <div className="p-2.5 rounded-2xl">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            </svg>
          </div>
          <span className="text-[8px] font-black uppercase tracking-widest">Config</span>
        </button>
      </footer>
    </div>
  );
};

export default App;