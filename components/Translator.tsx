
import React, { useState, useRef, useEffect } from 'react';
import { ProcessingStatus } from '../types';
import { translateAudio, translateText } from '../services/geminiService';

const LANGUAGES = [
  { label: 'English', value: 'English' },
  { label: 'Chinese', value: 'Chinese' },
  { label: 'Thai', value: 'Thai' },
  { label: 'Vietnamese', value: 'Vietnamese' },
  { label: 'Bahasa Indonesia', value: 'Bahasa Indonesia' },
  { label: 'Japanese', value: 'Japanese' },
  { label: 'Korean', value: 'Korean' },
  { label: 'Tagalog', value: 'Tagalog' },
];

interface TranslatorProps {
  status: ProcessingStatus;
  setStatus: (status: ProcessingStatus) => void;
}

const Translator: React.FC<TranslatorProps> = ({ status, setStatus }) => {
  const [isPressing, setIsPressing] = useState(false);
  const [targetLang, setTargetLang] = useState('English');
  const [translationData, setTranslationData] = useState<{original: string, translated: string} | null>(null);
  const [timer, setTimer] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const pressStartTimeRef = useRef<number>(0);
  const uiFeedbackTimeoutRef = useRef<number | null>(null);
  
  // Track which language the current 'translated' string belongs to
  const lastTranslatedToRef = useRef<string>('');

  const isBusy = status === ProcessingStatus.TRANSLATING;

  // Re-translate logic when target language changes or processing finishes
  useEffect(() => {
    const shouldReTranslate = 
      translationData?.original && 
      !isBusy && 
      !isPressing && 
      targetLang !== lastTranslatedToRef.current;

    if (shouldReTranslate) {
      const performReTranslation = async () => {
        setStatus(ProcessingStatus.TRANSLATING);
        const currentTextToTranslate = translationData!.original;
        const currentTarget = targetLang;
        
        try {
          const translated = await translateText(currentTextToTranslate, currentTarget);
          setTranslationData(prev => prev ? { ...prev, translated } : null);
          lastTranslatedToRef.current = currentTarget;
          setStatus(ProcessingStatus.IDLE);
        } catch (err) {
          console.error("Re-translation error:", err);
          setStatus(ProcessingStatus.ERROR);
          setTimeout(() => setStatus(ProcessingStatus.IDLE), 2000);
        }
      };
      performReTranslation();
    }
  }, [targetLang, isBusy, isPressing]); // dependencies ensure we catch changes after busy state ends

  const startRecording = async () => {
    if (isBusy) return;
    
    pressStartTimeRef.current = Date.now();
    
    // Delay visual feedback slightly to filter out accidental taps
    uiFeedbackTimeoutRef.current = window.setTimeout(() => {
      setIsPressing(true);
      timerIntervalRef.current = window.setInterval(() => setTimer(s => s + 1), 1000);
    }, 150);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const mediaRecorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 });
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        if (uiFeedbackTimeoutRef.current) {
          clearTimeout(uiFeedbackTimeoutRef.current);
          uiFeedbackTimeoutRef.current = null;
        }

        const pressDuration = Date.now() - pressStartTimeRef.current;
        const audioBlob = new Blob(chunksRef.current, { type: mimeType });
        stream.getTracks().forEach(track => track.stop());
        
        // Only process if press was long enough to be intentional
        if (pressDuration > 350 && audioBlob.size > 2000) {
          await handleTranslation(audioBlob);
        } else {
          // Reset UI if it was just a tap
          setIsPressing(false);
          setTimer(0);
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }
        }
      };

      mediaRecorder.start();
    } catch (err) {
      console.error("Mic access denied:", err);
      setIsPressing(false);
      if (uiFeedbackTimeoutRef.current) clearTimeout(uiFeedbackTimeoutRef.current);
    }
  };

  const stopRecording = () => {
    if (uiFeedbackTimeoutRef.current) {
      clearTimeout(uiFeedbackTimeoutRef.current);
      uiFeedbackTimeoutRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    
    setIsPressing(false);
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  const handleTranslation = async (blob: Blob) => {
    setStatus(ProcessingStatus.TRANSLATING);
    setTranslationData(null);
    const currentTarget = targetLang;
    
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const data = await translateAudio(base64, blob.type.split(';')[0], currentTarget);
        setTranslationData(data);
        lastTranslatedToRef.current = currentTarget;
        setStatus(ProcessingStatus.IDLE);
      };
    } catch (err) {
      console.error(err);
      setStatus(ProcessingStatus.ERROR);
      setTimeout(() => setStatus(ProcessingStatus.IDLE), 2000);
    }
  };

  return (
    <div className="w-full h-full flex flex-col gap-2 overflow-hidden">
      {/* Space-Saving Selector Line */}
      <div className="flex-none flex items-center justify-between px-2 pt-1">
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Translate to:</span>
        <select 
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
          className="bg-slate-900 border border-slate-800 text-indigo-400 text-[10px] font-black uppercase tracking-widest rounded-lg px-4 py-1 focus:outline-none focus:border-indigo-500 transition-colors"
        >
          {LANGUAGES.map(l => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </div>

      {/* Content Area - Designed for Single Page View (Up and Down Format) */}
      <div className="flex-1 flex flex-col gap-2 min-h-0">
        {/* Original Content (Up) - Balanced flex to allow more room below */}
        <div className="flex-[1.0] min-h-0 bg-slate-900/30 border border-slate-800/50 rounded-2xl p-4 flex flex-col shadow-inner">
          <div className="flex items-center gap-2 mb-2 flex-none">
            <div className="w-1.5 h-1.5 bg-slate-600 rounded-full"></div>
            <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Input Stream</span>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar text-sm text-slate-400 leading-relaxed font-light italic">
            {translationData?.original || (isBusy && !translationData ? "Decoding neural pulses..." : "Spoken words will appear here...")}
          </div>
        </div>

        {/* Translation Output (Down) - Significantly expanded for better readability */}
        <div className="flex-[3.5] min-h-0 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-5 flex flex-col shadow-lg shadow-indigo-500/5">
          <div className="flex items-center gap-2 mb-3 flex-none">
            <div className={`w-1.5 h-1.5 bg-indigo-500 rounded-full ${isBusy ? 'animate-pulse' : ''}`}></div>
            <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest">AI Translation ({targetLang})</span>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar text-lg text-slate-100 font-bold leading-tight">
            {isBusy ? (
              <div className="space-y-2 opacity-50">
                <div className="h-4 bg-slate-800 rounded w-3/4 animate-pulse"></div>
                <div className="h-4 bg-slate-800 rounded w-1/2 animate-pulse"></div>
              </div>
            ) : (
              translationData?.translated || "Translation output..."
            )}
          </div>
        </div>
      </div>

      {/* Control Area - Shifted downwards by using absolute-zero bottom and minimal padding */}
      <div className="flex-none flex flex-col items-center pt-1 pb-1">
        <div className={`mb-1 h-5 transition-all duration-300 ${isPressing ? 'opacity-100' : 'opacity-0'}`}>
          <span className="text-2xl font-mono font-black text-white">{timer}s</span>
        </div>

        <button
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onMouseLeave={isPressing ? stopRecording : undefined}
          onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
          onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
          disabled={isBusy}
          className={`w-[120px] h-[120px] rounded-full flex flex-col items-center justify-center transition-all duration-300 transform active:scale-90 shadow-2xl relative border-[6px] ${
            isPressing 
              ? 'bg-red-600 scale-105 shadow-red-500/40 border-red-500/20' 
              : isBusy 
                ? 'bg-slate-800 cursor-wait border-slate-700' 
                : 'bg-indigo-600 shadow-indigo-500/30 border-indigo-500/20'
          }`}
        >
          {isBusy ? (
            <svg className="animate-spin h-10 w-10 text-indigo-400" viewBox="0 0 24 24">
              <circle className="opacity-10" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
              <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-white mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
              </svg>
              <span className="text-[9px] font-black uppercase tracking-tighter text-white/70">Hold to Speak</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default Translator;
