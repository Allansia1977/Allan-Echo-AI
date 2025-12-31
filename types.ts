
export interface Memo {
  id: string;
  timestamp: number;
  audioBase64: string;
  mimeType: string;
  transcript: string;
  summary: string;
  duration: number;
  isProcessing?: boolean; 
  error?: boolean; 
}

export enum ProcessingStatus {
  IDLE = 'IDLE',
  RECORDING = 'RECORDING',
  TRANSCRIBING = 'TRANSCRIBING',
  SUMMARIZING = 'SUMMARIZING',
  TRANSLATING = 'TRANSLATING',
  ERROR = 'ERROR'
}

export type Tab = 'record' | 'translate' | 'library' | 'settings';
