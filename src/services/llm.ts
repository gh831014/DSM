import axios from 'axios';
import { GoogleGenAI } from "@google/genai";

export async function callQwen(messages: any[]) {
  try {
    const response = await axios.post('/api/llm/qwen', { messages });
    const content = response.data.choices?.[0]?.message?.content || response.data.output?.choices?.[0]?.message?.content;
    const usage = response.data.usage?.total_tokens || 0;
    return { content, usage };
  } catch (error) {
    console.warn("Qwen API failed, falling back to Gemini:", error);
    // Fallback to Gemini
    const lastMessage = messages[messages.length - 1].content;
    const systemMsg = messages.find(m => m.role === 'system')?.content;
    const content = await callGemini(lastMessage, systemMsg);
    // Estimate tokens for Gemini (rough estimate: 4 chars per token)
    const usage = Math.ceil((lastMessage.length + (systemMsg?.length || 0) + content.length) / 4);
    return { content, usage };
  }
}

export async function callGemini(prompt: string, systemInstruction?: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      systemInstruction: systemInstruction
    }
  });
  return response.text;
}
