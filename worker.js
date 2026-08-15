/**
 * BookNip — Cloudflare Worker + KV Cloud Sync Backend
 * 
 * Handles cross-device library synchronization for your personal BookNip PWA.
 * Authenticates requests using a shared Family Secret PIN header.
 * 
 * Environment Variables Required on Cloudflare:
 *  - BOOKNIP_KV: KV Namespace Binding
 *  - FAMILY_SECRET_PIN: Secret PIN string (e.g. "FamilySecret123!")
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Family-Pin',
};

export default {
  async fetch(request, env) {
    // Handle CORS Preflight OPTIONS Request
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS, status: 204 });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Validate Family PIN Header if FAMILY_SECRET_PIN environment variable is configured
    if (env.FAMILY_SECRET_PIN) {
      const incomingPin = request.headers.get('X-Family-Pin');
      if (!incomingPin || incomingPin !== env.FAMILY_SECRET_PIN) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized: Invalid Family PIN' }),
          { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    }

    try {
      // Test Connection / Health Check
      if (path === '/api/test' || path === '/test') {
        return new Response(
          JSON.stringify({ status: 'ok', message: 'Cloudflare Worker connected successfully!' }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      // GET /api/books — Fetch stored family library JSON from KV
      if (request.method === 'GET' && (path === '/api/books' || path === '/books')) {
        if (!env.BOOKNIP_KV) {
          return new Response(
            JSON.stringify({ error: 'BOOKNIP_KV namespace binding is missing in Cloudflare Worker settings.' }),
            { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }
        const storedData = await env.BOOKNIP_KV.get('family_library');
        const books = storedData ? JSON.parse(storedData) : [];
        return new Response(
          JSON.stringify({ books, timestamp: Date.now() }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      // POST /api/books — Save or update family library JSON in KV
      if (request.method === 'POST' && (path === '/api/books' || path === '/books')) {
        if (!env.BOOKNIP_KV) {
          return new Response(
            JSON.stringify({ error: 'BOOKNIP_KV namespace binding is missing in Cloudflare Worker settings.' }),
            { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }
        const body = await request.json();
        const books = Array.isArray(body) ? body : (body.books || []);
        
        await env.BOOKNIP_KV.put('family_library', JSON.stringify(books));

        return new Response(
          JSON.stringify({ status: 'success', count: books.length, timestamp: Date.now() }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Endpoint not found' }),
        { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Internal Server Error', details: err.message }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
  }
};
