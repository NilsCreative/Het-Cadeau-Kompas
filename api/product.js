// Haalt titel, foto, prijs en de echte productpagina op bij bol.
// Gebruikt de Marketing Catalog API met de zoektermen uit producten.json.
// Credentials staan in Vercel als BOL_CLIENT_ID en BOL_CLIENT_SECRET.
// Zonder credentials geeft deze functie een leeg antwoord, zodat de site
// gewoon blijft werken en alleen de foto's ontbreken.

const TOKEN_URL = 'https://login.bol.com/token?grant_type=client_credentials';
const ZOEK_URL = 'https://api.bol.com/marketing/catalog/v1/products/search';

let token = null;
let tokenTot = 0;

async function haalToken() {
  const id = process.env.BOL_CLIENT_ID;
  const secret = process.env.BOL_CLIENT_SECRET;
  if (!id || !secret) return null;

  const nu = Date.now();
  if (token && nu < tokenTot) return token;

  const basis = Buffer.from(id + ':' + secret).toString('base64');
  const ctrl = new AbortController();
  const stop = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + basis, Accept: 'application/json' },
      signal: ctrl.signal
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j.access_token) return null;
    token = j.access_token;
    // Een minuut marge, zodat we nooit met een net verlopen token bellen.
    tokenTot = nu + Math.max(0, (Number(j.expires_in) || 300) - 60) * 1000;
    return token;
  } catch {
    return null;
  } finally {
    clearTimeout(stop);
  }
}

async function zoek(term, bearer) {
  const url = ZOEK_URL
    + '?search-term=' + encodeURIComponent(term)
    + '&country-code=NL&page-size=1&include-image=true&include-offer=true';

  const ctrl = new AbortController();
  const stop = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(url, {
      headers: {
        Authorization: 'Bearer ' + bearer,
        Accept: 'application/json',
        'Accept-Language': 'nl'
      },
      signal: ctrl.signal
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(stop);
  }
}

function eersteResultaat(data) {
  const p = data && Array.isArray(data.results) ? data.results[0] : null;
  if (!p) return null;
  const prijs = p.offer && p.offer.price != null ? Number(p.offer.price) : null;
  return {
    titel: p.title || '',
    url: p.url || '',
    ean: p.ean || '',
    afbeelding: p.image && p.image.url ? p.image.url : '',
    prijs: prijs != null && !isNaN(prijs) ? prijs : null
  };
}

export default async function handler(req, res) {
  const ruw = req.query && req.query.q ? req.query.q : '';
  const termen = String(Array.isArray(ruw) ? ruw.join(';') : ruw)
    .split(';')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);

  res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');

  if (!termen.length) return res.status(200).json({});

  const bearer = await haalToken();
  if (!bearer) return res.status(200).json({});

  // Debugstand: geeft het onbewerkte antwoord van bol voor de eerste term.
  if (req.query && req.query.debug === '1') {
    const rauw = await zoek(termen[0], bearer);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ term: termen[0], antwoord: rauw });
  }

  const uit = {};
  const delen = await Promise.all(termen.map((t) => zoek(t, bearer)));
  termen.forEach((t, i) => {
    const p = eersteResultaat(delen[i]);
    if (p && p.afbeelding) uit[t] = p;
  });

  return res.status(200).json(uit);
}
