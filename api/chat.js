import { GoogleGenerativeAI } from '@google/generative-ai';

export const config = {
  runtime: 'edge', // Edge runtime for streaming
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: { message: 'Method not allowed' } }), { status: 405 });
  }

  try {
    const { messages, model } = await req.json();
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: { message: 'API key is missing in Vercel Environment Variables.' } }), { status: 500 });
    }

    // Initialize official Google Generative AI SDK
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const geminiModel = genAI.getGenerativeModel({ model: model || 'gemini-1.5-flash' });

    // Convert standard OpenAI messages array into Gemini SDK format
    let contents = [];
    let systemInstruction = "";

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction += msg.content + "\n";
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
      }
    }

    // If there is a system prompt, prepend it as a simulated initial prompt
    if (systemInstruction) {
      contents.unshift(
        { role: 'user', parts: [{ text: "System Instructions: " + systemInstruction }] },
        { role: 'model', parts: [{ text: "Understood." }] }
      );
    }

    // Call Gemini API Stream securely
    const streamResult = await geminiModel.generateContentStream({ contents });

    // Transform Gemini chunks into OpenAI SSE format so frontend HTML doesn't break
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamResult.stream) {
            const chunkText = chunk.text();
            if (chunkText) {
              const openAiPayload = {
                choices: [{ delta: { content: chunkText } }]
              };
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(openAiPayload)}\n\n`));
            }
          }
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          console.error("Stream Error:", err);
          controller.error(err);
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error("Vercel Backend Error:", error);
    return new Response(JSON.stringify({ error: { message: `Google API Error: ${error.message}` } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
