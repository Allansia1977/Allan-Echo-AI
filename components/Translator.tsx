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
  const [uploadProgress, setUploadProgress] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const pressStartTimeRef = useRef<number>(0);
  const uiFeedbackTimeoutRef = useRef<number | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  const requestIdRef = useRef<number>(0);
  const lastTranslatedToRef = useRef<string>('');
  const isBusy = status === ProcessingStatus.TRANSLATING;

  const cancelTranslation = () => {
    requestIdRef.current += 1;
    setStatus(ProcessingStatus.IDLE);
    setUploadProgress(false);
  };

  // Ensure AudioContext is ready for iOS
  const initAudioContext = () => {
    if (!audioContextRef.current) {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContextClass();
    }
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  useEffect(() => {
    const shouldReTranslate = 
      translationData?.original && 
      !isBusy && 
      !isPressing && 
      targetLang !== lastTranslatedToRef.current;

    if (shouldReTranslate) {
      const performReTranslation = async () => {
        const currentRequestId = ++requestIdRef.current;
        setStatus(ProcessingStatus.TRANSLATING);
        const currentTextToTranslate = translationData!.original;
        const currentTarget = targetLang;
        
        try {
          const translated = await translateText(currentTextToTranslate, currentTarget);
          if (currentRequestId === requestIdRef.current) {
            setTranslationData(prev => prev ? { ...prev, translated } : null);
            lastTranslatedToRef.current = currentTarget;
            setStatus(ProcessingStatus.IDLE);
          }
        } catch (err) {
          if (currentRequestId === requestIdRef.current) {
            console.error("Re-translation error:", err);
            setStatus(ProcessingStatus.ERROR);
            setTimeout(() => setStatus(ProcessingStatus.IDLE), 2000);
          }
        }
      };
      performReTranslation();
    }
  }, [targetLang, isBusy, isPressing]);

  const startRecording = async () => {
    if (isBusy) return;
    
    // Critical: Resume AudioContext on user gesture
    initAudioContext();

    if (!navigator.onLine) {
        alert("Connectivity error.");
        return;
    }

    pressStartTimeRef.current = Date.now();
    chunksRef.current = [];
    
    uiFeedbackTimeoutRef.current = window.setTimeout(() => {
      setIsPressing(true);
      setTimer(0);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = window.setInterval(() => setTimer(s => s + 1), 1000);
    }, 100);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          channelCount: 1, 
          echoCancellation: true, 
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      activeStreamRef.current = stream;
      
      // Enforce iOS-compatible MIME type
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
      const mimeType = isIOS ? 'audio/mp4' : (MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm');
      
      const mediaRecorder = new MediaRecorder(stream, { 
        mimeType, 
        audioBitsPerSecond: 64000 
      });
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (e) => { 
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        const pressDuration = Date.now() - pressStartTimeRef.current;
        
        // Stop tracks immediately
        if (activeStreamRef.current) {
          activeStreamRef.current.getTracks().forEach(track => track.stop());
          activeStreamRef.current = null;
        }

        if (pressDuration > 400 && chunksRef.current.length > 0) {
          const finalMime = chunksRef.current[0].type || mimeType;
          const audioBlob = new Blob(chunksRef.current, { type: finalMime });
          if (audioBlob.size > 100) {
            await handleTranslation(audioBlob);
          } else {
            resetUIState();
          }
        } else {
          resetUIState();
        }
      };
      
      // Use short timeslice for Safari stability
      mediaRecorder.start(100);
    } catch (err) {
      console.error("Mic error:", err);
      resetUIState();
    }
  };

  const resetUIState = () => {
    setIsPressing(false);
    setTimer(0);
    if (uiFeedbackTimeoutRef.current) clearTimeout(uiFeedbackTimeoutRef.current);
    if (timerIntervalRef.current) { 
      clearInterval(timerIntervalRef.current); 
      timerIntervalRef.current = null; 
    }
  };

  const stopRecording = () => {
    if (uiFeedbackTimeoutRef.current) { 
      clearTimeout(uiFeedbackTimeoutRef.current); 
      uiFeedbackTimeoutRef.current = null; 
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') { 
      try { 
        // Force request data to capture last bits on Safari
        mediaRecorderRef.current.requestData();
        mediaRecorderRef.current.stop(); 
      } catch(e){
        console.error("Stop error:", e);
      } 
    }
    
    setIsPressing(false);
    if (timerIntervalRef.current) { 
      clearInterval(timerIntervalRef.current); 
      timerIntervalRef.current = null; 
    }
  };

  const handleTranslation = async (blob: Blob) => {
    const currentRequestId = ++requestIdRef.current;
    setStatus(ProcessingStatus.TRANSLATING);
    setUploadProgress(true);
    setTranslationData(null);
    const currentTarget = targetLang;
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        if (currentRequestId !== requestIdRef.current) return;
        const result = reader.result as string;
        if (!result) {
           setStatus(ProcessingStatus.ERROR);
           return;
        }
        const base64 = result.split(',')[1];
        setUploadProgress(false);
        try {
          const data = await translateAudio(base64, blob.type, currentTarget);
          if (currentRequestId === requestIdRef.current) {
            setTranslationData(data);
            lastTranslatedToRef.current = currentTarget;
            setStatus(ProcessingStatus.IDLE);
          }
        } catch (apiErr) {
          if (currentRequestId === requestIdRef.current) {
            console.error("API Error:", apiErr);
            setStatus(ProcessingStatus.ERROR);
            setTimeout(() => setStatus(ProcessingStatus.IDLE), 3000);
          }
        }
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      if (currentRequestId === requestIdRef.current) {
        setStatus(ProcessingStatus.ERROR);
        setTimeout(() => setStatus(ProcessingStatus.IDLE), 2000);
      }
    }
  };

  return (
    <div className="w-full h-full flex flex-col min-h-0 overflow-hidden select-none touch-none">
      <div className="flex-none flex items-center justify-between px-2 pt-1 pb-1">
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Language</span>
        <select 
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
          className="bg-slate-900 border border-slate-800 text-indigo-400 text-[10px] font-black uppercase tracking-widest rounded-lg px-2 py-1 focus:outline-none transition-colors"
        >
          {LANGUAGES.map(l => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </div>

      <div className="flex-1 flex flex-col gap-1.5 min-h-0 overflow-hidden">
        <div className="flex-[0.35] min-h-0 bg-slate-900/40 border border-slate-800/50 rounded-2xl p-2.5 flex flex-col shadow-inner shrink-0 overflow-hidden">
          <div className="flex items-center gap-1.5 mb-1 flex-none">
            <div className="w-1.5 h-1.5 bg-slate-600 rounded-full"></div>
            <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Spoken</span>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar text-sm text-slate-400 leading-snug font-medium italic">
            {translationData?.original || (isBusy && !translationData ? (uploadProgress ? "Syncing..." : "Analysing...") : "Waiting...")}
          </div>
        </div>

        <div className="flex-[0.65] min-h-0 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-3.5 flex flex-col shadow-lg overflow-hidden">
          <div className="flex items-center gap-1.5 mb-1 flex-none">
            <div className={`w-1.5 h-1.5 bg-indigo-500 rounded-full ${isBusy ? 'animate-pulse' : ''}`}></div>
            <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest">Result</span>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar text-xl text-slate-100 font-extrabold leading-tight tracking-tight">
            {isBusy ? (
              <div className="space-y-2 opacity-30">
                <div className="h-5 bg-slate-800 rounded w-full animate-pulse"></div>
                <div className="h-5 bg-slate-800 rounded w-4/5 animate-pulse"></div>
              </div>
            ) : (
              translationData?.translated || "Standing by..."
            )}
          </div>
        </div>
      </div>

      {/* Button Section: Shifted up by 12px via mb-3 */}
      <div className="flex-none flex flex-col items-center pt-2 pb-1 mb-3">
        <div className={`h-6 transition-all duration-300 ${isPressing ? 'opacity-100' : 'opacity-0'}`}>
          <span className="text-xl font-mono font-black text-white">{timer}s</span>
        </div>

        <div className="flex items-center justify-center gap-4 w-full max-w-sm mx-auto px-6">
          <div className="flex-1 flex justify-end">
            {isBusy ? (
              <button
                onClick={cancelTranslation}
                className="w-11 h-11 rounded-full bg-slate-900 border border-red-500/60 flex flex-col items-center justify-center text-red-500 active:scale-90 transition-all shadow-lg"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-[5px] font-black uppercase mt-0.5 tracking-tighter">Exit</span>
              </button>
            ) : <div className="w-11 h-11"></div>}
          </div>

          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={isPressing ? stopRecording : undefined}
            onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
            onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
            disabled={isBusy}
            className={`w-[84px] h-[84px] flex-shrink-0 rounded-full flex flex-col items-center justify-center transition-all duration-300 transform active:scale-90 shadow-2xl relative border-[4px] ${
              isPressing 
                ? 'bg-red-600 scale-105 shadow-red-500/40 border-red-500/30' 
                : isBusy 
                  ? 'bg-slate-800 cursor-wait border-slate-700' 
                  : 'bg-indigo-600 shadow-indigo-500/30 border-indigo-500/30'
            }`}
          >
            {isBusy ? (
              <svg className="animate-spin h-7 w-7 text-indigo-400" viewBox="0 0 24 24">
                <circle className="opacity-10" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-white mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-20a3 3 0 00-3 3v10a3 3 0 003 3 3 3 0 003-3V5a3 3 0 00-3-3z" />
                </svg>
                <span className="text-[7px] font-black uppercase text-white/80 text-center leading-none">Record</span>
              </>
            )}
          </button>

          <div className="flex-1"></div>
        </div>
      </div>
    </div>
  );
};

export default Translator;