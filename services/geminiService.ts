import { GoogleGenAI, Type } from "@google/genai";

const getAIClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// Normalize MIME types for Gemini API compatibility (especially for mobile browsers)
const normalizeMimeType = (mimeType: string): string => {
  const lower = mimeType.toLowerCase();
  if (lower.includes('webm')) return 'audio/webm';
  // Safari on iOS often uses x-m4a or just mp4
  if (lower.includes('mp4') || lower.includes('m4a') || lower.includes('x-m4a') || lower.includes('aac')) return 'audio/mp4';
  if (lower.includes('mpeg') || lower.includes('mp3')) return 'audio/mpeg';
  if (lower.includes('wav')) return 'audio/wav';
  return 'audio/mp4'; // Default fallback for mobile
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
  } catch (error) {
    console.error("Transcription API error:", error);
    throw error;
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
  } catch (error) {
    console.error("Summarization API error:", error);
    return "Summary unavailable.";
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
            1. Transcribe the audio verbatim in its original spoken language (e.g. if I speak Thai, the "original" field must be in Thai). 
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
              description: "Verbatim transcription of the audio in its original spoken language."
            },
            translated: { 
              type: Type.STRING, 
              description: "The translation into the requested target language."
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
      console.warn("JSON parse failed, attempting fallback extraction", text);
      return { original: "Audio processed (format error)", translated: text.substring(0, 100) };
    }
  } catch (error) {
    console.error("Translate Audio API error:", error);
    throw error;
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
  } catch (error) {
    console.error("Translate Text API error:", error);
    throw error;
  }
};