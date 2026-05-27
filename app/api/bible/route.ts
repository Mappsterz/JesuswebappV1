import { NextRequest } from 'next/server';
import { BibleResponse, BibleVerse } from '@/lib/types';

// Simple in-memory cache to reduce repeated API calls
const cache = new Map<string, { data: BibleResponse; timestamp: number }>();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

function getCached(key: string): BibleResponse | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: BibleResponse): void {
  // Prevent unbounded cache growth
  if (cache.size > 500) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { data, timestamp: Date.now() });
}

interface BibleApiVerse {
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
}

interface BibleApiResponse {
  reference: string;
  text: string;
  verses: BibleApiVerse[];
  error?: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reference = searchParams.get('reference');
    const search = searchParams.get('search');

    if (!reference && !search) {
      return Response.json(
        { error: 'Missing query parameter: provide either "reference" (e.g. John+3:16) or "search" (e.g. love+one+another)' },
        { status: 400 }
      );
    }

    // Build the bible-api.com URL
    const query = reference || search || '';
    const apiUrl = `https://bible-api.com/${encodeURIComponent(query)}`;

    // Check cache first
    const cacheKey = apiUrl.toLowerCase();
    const cached = getCached(cacheKey);
    if (cached) {
      return Response.json(cached, {
        headers: { 'X-Cache': 'HIT' },
      });
    }

    // Fetch from bible-api.com
    const apiResponse = await fetch(apiUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000), // 10-second timeout
    });

    if (!apiResponse.ok) {
      if (apiResponse.status === 404) {
        return Response.json(
          { error: `Verse not found: "${query}". Please check the reference format (e.g. "John 3:16" or "Romans 8:28").` },
          { status: 404 }
        );
      }
      return Response.json(
        { error: `Bible API returned status ${apiResponse.status}` },
        { status: 502 }
      );
    }

    const raw: BibleApiResponse = await apiResponse.json();

    if (raw.error) {
      return Response.json(
        { error: raw.error },
        { status: 404 }
      );
    }

    // Normalize into our response shape
    const verses: BibleVerse[] = (raw.verses || []).map((v: BibleApiVerse) => ({
      book_name: v.book_name,
      chapter: v.chapter,
      verse: v.verse,
      text: v.text.trim(),
    }));

    const result: BibleResponse = {
      reference: raw.reference,
      text: raw.text.trim(),
      verses,
    };

    // Store in cache
    setCache(cacheKey, result);

    return Response.json(result, {
      headers: { 'X-Cache': 'MISS' },
    });
  } catch (error) {
    console.error('Bible API error:', error);

    if (error instanceof TypeError && (error as NodeJS.ErrnoException).cause) {
      return Response.json(
        { error: 'Unable to reach the Bible API. Please try again later.' },
        { status: 503 }
      );
    }

    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
