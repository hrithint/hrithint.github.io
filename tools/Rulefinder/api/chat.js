export const config = {
  runtime: 'edge', // Use Edge runtime for optimal streaming performance
};

export default async function handler(req) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await req.json();
    
    // Read the secret API key from Vercel Environment Variables
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'API key not configured on Vercel' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Forward the streaming request to Gemini's OpenAI compatibility endpoint
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GEMINI_API_KEY}`,
        },
        body: JSON.stringify(body),
      }
    );

    // Return the response stream transparently to the browser
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error("Vercel Proxy Error:", error);
    return new Response(JSON.stringify({ error: 'Failed to process request on server' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
