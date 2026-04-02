import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const CACHE_KEY = 'marine_news_cache';
const CACHE_TTL = 4 * 60 * 60; // 4 hours in seconds

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GNEWS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GNews API key not configured' });
  }

  try {
    // Check cache first
    const cachedData = await redis.get(CACHE_KEY);
    
    if (cachedData) {
      console.log('Serving from cache');
      return res.status(200).json(cachedData);
    }

    // Fetch fresh data from GNews API
    console.log('Fetching fresh data from GNews API');
    const lang = 'en';
    const max = 20;
    
    const searchTerms = ['marine', 'offshore', 'shipbuilding', 'naval architecture', 'ships', 'boats'];
    const q = searchTerms.join(' OR ');
    
    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}&lang=${lang}&max=${max}&apikey=${apiKey}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`GNews API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Store in cache with 4-hour TTL
    await redis.set(CACHE_KEY, data, { ex: CACHE_TTL });
    console.log('Data cached for 4 hours');
    
    return res.status(200).json(data);
  } catch (error) {
    console.error('News API error:', error);
    return res.status(500).json({ error: 'Failed to fetch news' });
  }
}
