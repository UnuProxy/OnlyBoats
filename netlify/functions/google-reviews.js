// ════════════════════════════════════════════════════════════
//  GOOGLE REVIEWS FUNCTION
//  Fetches reviews from Google Places API (New) and proxies them
//  back to the frontend. Keeps the API key safe on the server.
//  Response is cached for 1 hour at the CDN edge.
// ════════════════════════════════════════════════════════════

const PLACE_ID = 'ChIJp-s7_opHmRIRLUwDDFs9B8E'; // Just Enjoy Ibiza
const FIELD_MASK = 'id,displayName,rating,userRatingCount,reviews,googleMapsUri';

exports.handler = async () => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Server misconfigured: GOOGLE_PLACES_API_KEY environment variable is not set in Netlify.',
      }),
    };
  }

  try {
    const url = `https://places.googleapis.com/v1/places/${PLACE_ID}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
        'Accept-Language': 'en',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Google Places API error:', response.status, errorBody);
      return {
        statusCode: response.status,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Failed to fetch reviews from Google',
          status: response.status,
          details: errorBody,
        }),
      };
    }

    const data = await response.json();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        'Netlify-CDN-Cache-Control': 'public, max-age=3600, durable',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
      body: JSON.stringify(data),
    };
  } catch (err) {
    console.error('google-reviews function error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal error',
        message: err.message,
      }),
    };
  }
};
