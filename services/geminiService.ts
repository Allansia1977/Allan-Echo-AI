
import { GoogleGenAI, Type } from "@google/genai";

const getAIClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const transcribeAudio = async (base64Audio: string, mimeType: string): Promise<string> => {
  const ai = getAIClient();
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
          text: "Transcribe audio. Only text, no comments."
        }
      ]
    },
    config: {
      thinkingConfig: { thinkingBudget: 0 }
    }
  });
  return response.text || "Transcription failed.";
};

export const summarizeTranscript = async (transcript: string): Promise<string> => {
  const ai = getAIClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Summarize concisely: \n\n ${transcript}`,
    config: {
      thinkingConfig: { thinkingBudget: 0 }
    }
  });
  return response.text || "Summary generation failed.";
};

export const translateAudio = async (base64Audio: string, mimeType: string, targetLanguage: string): Promise<{original: string, translated: string}> => {
  const ai = getAIClient();
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
          text: `Transcribe the original speech exactly, and then translate it into ${targetLanguage}. Even if the original is the same as the target, provide the text in ${targetLanguage}. Return as JSON with keys "original" and "translated".`
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
  
  try {
    return JSON.parse(response.text || '{"original": "", "translated": "Error"}');
  } catch (e) {
    return { original: "Error parsing result", translated: "Error" };
  }
};

export const translateText = async (text: string, targetLanguage: string): Promise<string> => {
  const ai = getAIClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Translate the following text into ${targetLanguage}. Output ONLY the translated text in ${targetLanguage}. If the input is already in ${targetLanguage}, just return it exactly as is: \n\n ${text}`,
    config: {
      thinkingConfig: { thinkingBudget: 0 }
    }
  });
  return response.text || "Translation failed.";
};
