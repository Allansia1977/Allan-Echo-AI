import React, { useState, useRef, useEffect } from 'react';
import { ProcessingStatus } from '../types';

interface RecorderProps {
  onRecordingComplete: (blob: Blob, duration: number) => void;
  status: ProcessingStatus;
}

const Recorder: React.FC<RecorderProps> = ({ onRecordingComplete, status }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = window.setInterval(() => {
        setSeconds(s => s + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setSeconds(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const initAudioEngine = async () => {
    if (!audioContextRef.current) {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContextClass();
    }
    if (audioContextRef.current?.state === 'suspended') {
      await audioContextRef.current.resume();
    }
  };

  const startRecording = async () => {
    try {
      await initAudioEngine();

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      streamRef.current = stream;
      
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
      const mimeType = isIOS ? 'audio/mp4' : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4');
        
      const mediaRecorder = new MediaRecorder(stream, { 
        mimeType,
        audioBitsPerSecond: 32000 // Optimized for upload
      });
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        if (chunksRef.current.length > 0) {
          const audioBlob = new Blob(chunksRef.current, { type: mimeType });
          // Safari 0-byte check
          if (audioBlob.size > 1500) {
             onRecordingComplete(audioBlob, seconds);
          } else {
             console.warn("Audio captured was empty (Safari bug)");
          }
        }
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(250);
      setIsRecording(true);
    } catch (err) {
      console.error("Mic access denied:", err);
      alert("Please allow microphone access in iPhone Settings.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.requestData();
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isProcessing = status === ProcessingStatus.TRANSCRIBING || status === ProcessingStatus.SUMMARIZING;

  return (
    <div className={`w-full flex flex-col items-center justify-center py-10 px-6 rounded-[2.5rem] shadow-2xl border transition-all duration-700 relative overflow-hidden ${isRecording ? 'bg-slate-900 border-indigo-500/50' : 'bg-slate-900/40 border-slate-800'}`}>
      
      {isRecording && (
        <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 bg-indigo-500/5 animate-pulse"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[180px] h-[180px] bg-indigo-500/10 blur-[60px] rounded-full animate-pulse"></div>
        </div>
      )}

      <div className="relative z-10 w-full px-4 text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-1.5">
            {isRecording && <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping"></div>}
            <h2 className="text-xl font-black text-slate-100 uppercase tracking-tight">
                {isRecording ? "Listening..." : isProcessing ? "AI Thinking..." : "Ready to Record"}
            </h2>
        </div>
        <p className="text-slate-500 text-[10px] uppercase font-black tracking-widest leading-none">
          {isRecording ? "Capturing voice data" : isProcessing ? "Processing neural path" : "Tap to start memo"}
        </p>
      </div>

      <div className="relative z-10 flex flex-col items-center">
        <div className="relative">
          {isRecording && (
            <div className="absolute inset-0 animate-ping rounded-full bg-red-500/20 scale-125 duration-1000"></div>
          )}
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
            className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 transform active:scale-95 shadow-2xl ${
              isRecording 
                ? "bg-red-600 text-white border-4 border-red-500/20" 
                : isProcessing 
                  ? "bg-slate-800 text-slate-600 border-2 border-slate-700" 
                  : "bg-indigo-600 text-white border-4 border-indigo-500/20 shadow-indigo-500/20"
            }`}
          >
            {isRecording ? (
              <div className="w-8 h-8 bg-white rounded-sm"></div>
            ) : isProcessing ? (
              <svg className="animate-spin h-10 w-10" viewBox="0 0 24 24">
                <circle className="opacity-10" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-20a3 3 0 00-3 3v10a3 3 0 003 3 3 3 0 003-3V5a3 3 0 00-3-3z" />
              </svg>
            )}
          </button>
        </div>

        <div className={`mt-2 text-2xl font-mono font-black transition-all duration-300 ${isRecording ? 'text-white scale-110 tracking-widest' : 'text-slate-800 opacity-20'}`}>
          {formatTime(seconds)}
        </div>
      </div>
    </div>
  );
};

export default Recorder;