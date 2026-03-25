export const config = {
  runtime: 'edge', // Fast streaming runtime (zero dependencies)
};

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const { messages, model } = await req.json();
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: { message: 'API key is missing in Vercel.' } }), { status: 500 });
    }

    // Convert standard OpenAI messages into Gemini REST format
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

    if (systemInstruction) {
      contents.unshift(
        { role: 'user', parts: [{ text: "System Instructions: " + systemInstruction }] },
        { role: 'model', parts: [{ text: "Understood." }] }
      );
    }

    const geminiModel = model || 'gemini-2.5-flash';
    const geminiURL = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

    const geminiResponse = await fetch(geminiURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents }),
    });

    if (!geminiResponse.ok) {
      const errHtml = await geminiResponse.text();
      let allowed = "";
      try {
        const modelsRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
        const modelsData = await modelsRes.json();
        if (modelsData.models) {
          allowed = " | ACTUAL ALLOWED MODELS For Your Key: " + modelsData.models.map(m => m.name.replace('models/', '')).filter(m => m.includes('gemini')).join(', ');
        }
      } catch (e) {}

      return new Response(JSON.stringify({ error: { message: `Google API Error: ${errHtml}${allowed}` } }), { status: 500 });
    }

    // Transform Gemini SEE stream into OpenAI SSE stream format
    const reader = geminiResponse.body.getReader();
    const decoder = new TextDecoder();
    
    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const dataStr = line.slice(6);
                if (dataStr === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(dataStr);
                  // Gemini payload: {"candidates": [{"content": {"parts": [{"text": "Hello"}]}}]}
                  const chunkText = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                  
                  if (chunkText) {
                    const openAiPayload = { choices: [{ delta: { content: chunkText } }] };
                    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(openAiPayload)}\n\n`));
                  }
                } catch (err) {
                  // Skip incomplete JSON chunks
                }
              }
            }
          }
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
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
    return new Response(JSON.stringify({ error: { message: `Server Error: ${error.message}` } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
