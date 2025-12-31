import { GoogleGenAI, Type } from "@google/genai";

const getAIClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const transcribeAudio = async (base64Audio: string, mimeType: string): Promise<string> => {
  const ai = getAIClient();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Audio
            }
          },
          {
            text: "Transcribe this audio exactly. Return only the transcription text."
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
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Audio
            }
          },
          {
            text: `1. Transcribe the audio original language. 2. Translate it to ${targetLanguage}. Return JSON: {"original": "...", "translated": "..."}`
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            original: { type: Type.STRING },
            translated: { type: Type.STRING }
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
      contents: `Translate to ${targetLanguage}. Return ONLY the translation: \n\n ${text}`,
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