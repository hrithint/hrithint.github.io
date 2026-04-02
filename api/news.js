export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GNEWS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GNews API key not configured' });
  }

  try {
    const lang = 'en';
    const max = 10;
    
    const searchTerms = ['marine', 'offshore', 'shipbuilding', 'naval architecture', 'ships', 'boats'];
    const q = searchTerms.join(' OR ');
    
    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}&lang=${lang}&max=${max}&apikey=${apiKey}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`GNews API error: ${response.status}`);
    }

    const data = await response.json();
    
    return res.status(200).json(data);
  } catch (error) {
    console.error('News API error:', error);
    return res.status(500).json({ error: 'Failed to fetch news' });
  }
}
