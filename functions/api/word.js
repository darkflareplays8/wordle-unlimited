// functions/api/word.js
//
// Cloudflare Pages Function — GET /api/word
//
// Proxies the Datamuse API (api.datamuse.com) to fetch a random 5-letter
// English word for the game's puzzle. Datamuse is free, requires no API key,
// allows up to 100,000 requests/day, and runs on real, fast infrastructure
// (no sleepy free-tier dyno spin-up delay).
//
// Doing this server-side (rather than calling it straight from the browser)
// isn't strictly required for CORS here, but it lets us clean up the
// response before the client ever sees it: Datamuse's sp=????? wildcard
// returns words sorted by popularity, so calling it directly would mean the
// same ~20 common words every single game. Instead we pull a large batch
// and pick randomly server-side for real variety, and always hand back a
// small, predictable JSON shape.

const SOURCE = (() => {
  const url = new URL("https://api.datamuse.com/words");
  url.searchParams.set("sp", "?????"); // exactly 5 of any character
  url.searchParams.set("max", "500"); // large batch so we're not always
                                       // handed the same ~20 popular words
  return url.toString();
})();
const MAX_ATTEMPTS = 3;

function isCleanFiveLetterWord(word) {
  return typeof word === "string" && /^[a-zA-Z]{5}$/.test(word);
}

export async function onRequestGet(context) {
  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const upstream = await fetch(SOURCE, {
        headers: { accept: "application/json" },
        cf: { cacheTtl: 0, cacheEverything: false },
      });

      if (!upstream.ok) continue;

      let results;
      try {
        results = await upstream.json();
      } catch {
        continue;
      }

      if (!Array.isArray(results)) continue;

      // Datamuse returns objects like {"word": "apple", "score": 1234} —
      // multiword entries ("hot dog") and anything non-alphabetic get
      // filtered out by isCleanFiveLetterWord.
      const candidates = results
        .map((r) => r && r.word)
        .filter(isCleanFiveLetterWord);

      if (candidates.length > 0) {
        const word =
          candidates[
            Math.floor(Math.random() * candidates.length)
          ].toLowerCase();

        return new Response(JSON.stringify({ word, source: "datamuse" }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "access-control-allow-origin": "*",
          },
        });
      }
    }

    // Upstream kept returning junk — fall back so the game never just breaks.
    return fallbackResponse();
  } catch (err) {
    return fallbackResponse();
  }
}

function fallbackResponse() {
  const FALLBACK_WORDS = [
    "plane", "crane", "stone", "grape", "flame", "smile", "brick",
    "cloud", "dance", "eagle", "frost", "ghost", "house", "input",
    "jolly", "knife", "lemon", "mango", "noble", "ocean", "piano",
    "quilt", "river", "sugar", "tiger", "uncle", "vivid", "whale",
  ];
  const word = FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)];
  return new Response(JSON.stringify({ word, source: "fallback" }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}
