
import { GoogleGenAI, Type } from "@google/genai";

const getAIClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

/**
 * Normalizes MIME types for Gemini API.
 * iOS Safari typically produces 'audio/mp4' or 'audio/x-m4a'.
 * Gemini prefers 'audio/mp4' for these formats.
 */
const normalizeMimeType = (mimeType: string): string => {
  const lower = mimeType.toLowerCase();
  if (lower.includes('webm')) return 'audio/webm';
  // Standardize all Apple formats to audio/mp4 for Gemini compatibility
  if (lower.includes('mp4') || lower.includes('m4a') || lower.includes('x-m4a') || lower.includes('aac')) {
    return 'audio/mp4';
  }
  if (lower.includes('mpeg') || lower.includes('mp3')) return 'audio/mpeg';
  if (lower.includes('wav')) return 'audio/wav';
  return 'audio/mp4'; // Robust default for mobile
};

export const transcribeAudio = async (base64Audio: string, mimeType: string): Promise<string> => {
  const ai = getAIClient();
  const normalizedMime = normalizeMimeType(mimeType);
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: normalizedMime,
              data: base64Audio
            }
          },
          {
            text: "Transcribe this audio exactly in its original language. Return only the transcription text."
          }
        ]
      },
      config: {
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    return response.text?.trim() || "Transcription produced no text.";
  } catch (error: any) {
    console.error("Transcription API error:", error);
    const msg = error.message || "Unknown API Error";
    throw new Error(`TRANSCRIPTION_FAILED: ${msg} (Mime: ${normalizedMime})`);
  }
};

export const summarizeTranscript = async (transcript: string): Promise<string> => {
  const ai = getAIClient();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Summarize the following transcript in 1-2 concise sentences: \n\n ${transcript}`,
      config: {
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    return response.text?.trim() || "Summary failed.";
  } catch (error: any) {
    console.error("Summarization API error:", error);
    throw new Error(`SUMMARIZATION_FAILED: ${error.message}`);
  }
};

export const translateAudio = async (base64Audio: string, mimeType: string, targetLanguage: string): Promise<{original: string, translated: string}> => {
  const ai = getAIClient();
  const normalizedMime = normalizeMimeType(mimeType);
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: normalizedMime,
              data: base64Audio
            }
          },
          {
            text: `Detect the spoken language. 
            1. Transcribe the audio verbatim in its original spoken language. 
            2. Translate that transcription into ${targetLanguage}. 
            Return the result as a JSON object with keys "original" and "translated".`
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            original: { 
              type: Type.STRING,
              description: "Verbatim transcription of the audio."
            },
            translated: { 
              type: Type.STRING, 
              description: "The translation."
            }
          },
          required: ["original", "translated"]
        },
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    
    const text = response.text || "";
    try {
      return JSON.parse(text);
    } catch (e) {
      return { original: "Audio processed", translated: text };
    }
  } catch (error: any) {
    console.error("Translate Audio API error:", error);
    const msg = error.message || "Unknown API Error";
    throw new Error(`API_REJECTED: ${msg} (Mime: ${normalizedMime}, Size: ${Math.round(base64Audio.length * 0.75 / 1024)}KB)`);
  }
};

export const translateText = async (text: string, targetLanguage: string): Promise<string> => {
  const ai = getAIClient();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Translate the following text to ${targetLanguage}. Return ONLY the translation text itself: \n\n ${text}`,
      config: {
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    return response.text?.trim() || "Translation failed.";
  } catch (error: any) {
    console.error("Translate Text API error:", error);
    throw new Error(`TEXT_TRANSLATION_FAILED: ${error.message}`);
  }
};
