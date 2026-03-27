export const config = {
  runtime: 'edge', // Fast streaming runtime (zero dependencies)
};

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const { messages, model, temperature, max_tokens } = await req.json();
    const GROQ_API_KEY = process.env.GROQ_API_KEY;

    if (!GROQ_API_KEY) {
      return new Response(JSON.stringify({ error: { message: 'GROQ_API_KEY is missing in Vercel.' } }), { status: 500 });
    }

    const groqModel = model || 'llama-3.1-8b-instant';
    const groqURL = 'https://api.groq.com/openai/v1/chat/completions';

    const payload = {
      messages: messages,
      model: groqModel,
      temperature: temperature !== undefined ? temperature : 0.7,
      max_tokens: max_tokens || 2048,
      stream: true
    };

    const groqResponse = await fetch(groqURL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
    });

    if (!groqResponse.ok) {
      const errJson = await groqResponse.json();
      return new Response(JSON.stringify({ error: { message: `Groq API Error: ${errJson.error?.message || errJson}` } }), { status: 500 });
    }

    const reader = groqResponse.body.getReader();
    const decoder = new TextDecoder();
    
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const dataStr = line.slice(6);
                if (dataStr === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(dataStr);
                  const chunkText = parsed.choices?.[0]?.delta?.content;
                  
                  if (chunkText) {
                    const openAiPayload = { choices: [{ delta: { content: chunkText } }] };
                    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(openAiPayload)}\n\n`));
                  }
                } catch (err) {}
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
