import { Redis } from '@upstash/redis';

const CACHE_KEY = 'marine_news_cache';
const CACHE_TTL = 30 * 60;

function getRedisClient() {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return null;
  }
  return new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GNEWS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GNews API key not configured' });
  }

  const redis = getRedisClient();

  try {
    if (redis) {
      const cachedData = await redis.get(CACHE_KEY);
      const cachedAt = await redis.get(CACHE_KEY + '_time');
      
      if (cachedData) {
        console.log('✓ Serving from Upstash cache');
        return res.status(200).json({
          ...cachedData,
          _cached: true,
          _cachedAt: cachedAt || 'unknown'
        });
      }
    } else {
      console.log('⚠ Redis not configured');
    }

    console.log('↻ Fetching fresh data from GNews API');
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
    const cachedAt = new Date().toISOString();
    
    if (redis) {
      await redis.set(CACHE_KEY, data, { ex: CACHE_TTL });
      await redis.set(CACHE_KEY + '_time', cachedAt, { ex: CACHE_TTL });
      console.log('✓ Cached at:', cachedAt);
    }
    
    return res.status(200).json({
      ...data,
      _cached: false,
      _cachedAt: cachedAt
    });
  } catch (error) {
    console.error('✗ Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
