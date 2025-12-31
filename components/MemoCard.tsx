
import React, { useState, useRef } from 'react';
import { Memo } from '../types';

interface MemoCardProps {
  memo: Memo;
  onDelete: (id: string) => void;
}

const MemoCard: React.FC<MemoCardProps> = ({ memo, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioSource = `data:${memo.mimeType};base64,${memo.audioBase64}`;

  const formatDate = (timestamp: number) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(timestamp));
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const calculateSize = (base64String: string) => {
    const padding = (base64String.match(/=/g) || []).length;
    const sizeInBytes = (base64String.length * 3) / 4 - padding;
    if (sizeInBytes < 1024) return `${sizeInBytes.toFixed(0)} B`;
    if (sizeInBytes < 1024 * 1024) return `${(sizeInBytes / 1024).toFixed(1)} KB`;
    return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (memo.isProcessing) return;
    
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleSummary = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (memo.isProcessing) return;
    setExpanded(!expanded);
  };

  const onTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const onLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const onEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = audioSource;
    link.download = `echo-memo-${memo.timestamp}.${memo.mimeType.split('/')[1] || 'webm'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`bg-slate-900/80 rounded-[2rem] shadow-xl border border-slate-800/50 mb-3 hover:border-slate-700/50 transition-all group overflow-hidden ${memo.isProcessing ? 'opacity-60' : ''}`}>
      <audio 
        ref={audioRef} 
        src={audioSource} 
        onTimeUpdate={onTimeUpdate} 
        onLoadedMetadata={onLoadedMetadata} 
        onEnded={onEnded}
        className="hidden"
      />
      
      <div className="p-4 flex items-center gap-3">
        {/* Playback Button */}
        <button 
          onClick={togglePlay}
          disabled={memo.isProcessing}
          className={`w-12 h-12 flex-shrink-0 rounded-2xl flex items-center justify-center transition-all transform active:scale-90 shadow-2xl border ${
            memo.isProcessing 
              ? 'bg-slate-800 text-slate-700 border-slate-700 cursor-wait' 
              : isPlaying 
                ? 'bg-indigo-500 text-white border-indigo-400 shadow-indigo-500/20' 
                : 'bg-slate-950 text-indigo-400 hover:bg-slate-800 border-slate-800'
          }`}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {memo.isProcessing ? (
            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-10" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : isPlaying ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-0.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 001.555-.832l3-2z" clipRule="evenodd" />
            </svg>
          )}
        </button>

        {/* Content Info */}
        <div onClick={() => !memo.isProcessing && setExpanded(!expanded)} className={`cursor-pointer flex-grow min-w-0 ${memo.isProcessing ? 'cursor-wait' : ''}`}>
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className={`text-slate-100 font-bold text-xs truncate uppercase tracking-tight ${memo.isProcessing ? 'animate-pulse text-slate-500' : ''}`}>
              {memo.isProcessing ? 'Processing...' : `Memo_${memo.id.slice(0, 4)}`}
            </h3>
            {memo.error && <span className="text-[7px] font-black bg-red-500 text-white px-1 py-0.5 rounded-full uppercase">Err</span>}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-[8px] font-black text-slate-600 uppercase tracking-wider">{formatDate(memo.timestamp)}</span>
            <span className="w-0.5 h-0.5 bg-slate-800 rounded-full"></span>
            <span className="text-[8px] font-black text-indigo-500/70 uppercase tracking-widest">{formatTime(duration || memo.duration)}</span>
            <span className="w-0.5 h-0.5 bg-slate-800 rounded-full"></span>
            <span className="text-[8px] font-bold text-slate-500 bg-slate-950/50 px-1.5 py-0.5 rounded uppercase tracking-tighter">
              {calculateSize(memo.audioBase64)}
            </span>
          </div>
        </div>

        {/* Summary Button */}
        <button 
          onClick={toggleSummary}
          disabled={memo.isProcessing}
          className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all active:scale-95 ${
            expanded 
              ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400' 
              : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-indigo-500/30 hover:text-indigo-400'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="text-[9px] font-black uppercase tracking-widest">Summary</span>
        </button>

        {/* Mini Actions */}
        <div className="flex items-center opacity-40 hover:opacity-100 transition-opacity">
          <button 
            onClick={() => onDelete(memo.id)}
            className="p-2 text-slate-600 hover:text-red-500 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Modern Progress Bar */}
      <div className={`h-0.5 bg-slate-950 relative ${isPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-20'} transition-opacity`}>
        <div 
          className="absolute top-0 left-0 h-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]" 
          style={{ width: `${(currentTime / (duration || memo.duration)) * 100}%` }}
        ></div>
      </div>

      {/* AI Expanded Intel */}
      {(expanded || memo.isProcessing) && (
        <div className="p-5 bg-slate-950/40 border-t border-slate-800/50 animate-in fade-in slide-in-from-top-3 duration-500">
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <div className={`w-1 h-3 rounded-full ${memo.isProcessing ? 'bg-indigo-500 animate-pulse' : 'bg-amber-500'}`}></div>
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Abstract</span>
                </div>
                {!memo.isProcessing && (
                    <button onClick={handleDownload} className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest hover:text-indigo-300">Save Raw</button>
                )}
              </div>
              <p className={`text-slate-200 text-xs leading-relaxed font-medium ${memo.isProcessing ? 'text-slate-600 italic' : ''}`}>
                {memo.summary}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-1 h-3 rounded-full ${memo.isProcessing ? 'bg-indigo-500/50 animate-pulse' : 'bg-indigo-500'}`}></div>
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Source Transcript</span>
              </div>
              <p className={`text-slate-500 text-xs italic leading-relaxed font-medium ${memo.isProcessing ? 'animate-pulse text-slate-700' : ''}`}>
                {memo.transcript}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MemoCard;
