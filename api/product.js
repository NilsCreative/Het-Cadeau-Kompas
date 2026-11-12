// Haalt titel, foto, prijs en de echte productpagina op bij bol.
// Gebruikt de Marketing Catalog API met de zoektermen uit producten.json.
// Credentials staan in Vercel als BOL_CLIENT_ID en BOL_CLIENT_SECRET.
// Zonder credentials geeft deze functie een leeg antwoord, zodat de site
// gewoon blijft werken en alleen de foto's ontbreken.
//
// Nakijken wat er misgaat: /api/product?q=aeropress&debug=1
// Die stand verklapt nooit de sleutels zelf, alleen of ze aanwezig zijn
// en wat bol antwoordt.

const TOKEN_URL = 'https://login.bol.com/token?grant_type=client_credentials';
const ZOEK_URL = 'https://api.bol.com/marketing/catalog/v1/products/search';

let token = null;
let tokenTot = 0;

async function haalToken(diag) {
  const id = process.env.BOL_CLIENT_ID;
  const secret = process.env.BOL_CLIENT_SECRET;

  if (diag) {
    diag.heeftClientId = !!id;
    diag.heeftClientSecret = !!secret;
    diag.lengteClientId = id ? id.length : 0;
    diag.lengteClientSecret = secret ? secret.length : 0;
  }
  if (!id || !secret) {
    if (diag) diag.reden = 'BOL_CLIENT_ID of BOL_CLIENT_SECRET ontbreekt in deze deployment';
    return null;
  }

  const nu = Date.now();
  if (token && nu < tokenTot) {
    if (diag) diag.tokenUitCache = true;
    return token;
  }

  const basis = Buffer.from(id.trim() + ':' + secret.trim()).toString('base64');
  const ctrl = new AbortController();
  const stop = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + basis, Accept: 'application/json' },
      signal: ctrl.signal
    });
    if (diag) diag.tokenStatus = r.status;
    const tekst = await r.text();
    if (!r.ok) {
      if (diag) diag.tokenAntwoord = tekst.slice(0, 400);
      return null;
    }
    let j = {};
    try { j = JSON.parse(tekst); } catch (e) {
      if (diag) diag.reden = 'antwoord van login.bol.com was geen JSON';
      return null;
    }
    if (!j.access_token) {
      if (diag) {
        diag.reden = 'geen access_token in het antwoord';
        diag.tokenVelden = Object.keys(j);
      }
      return null;
    }
    token = j.access_token;
    tokenTot = nu + Math.max(0, (Number(j.expires_in) || 300) - 60) * 1000;
    if (diag) diag.tokenGeldigSeconden = Number(j.expires_in) || null;
    return token;
  } catch (e) {
    if (diag) diag.reden = 'netwerkfout bij login.bol.com: ' + (e && e.name ? e.name : 'onbekend');
    return null;
  } finally {
    clearTimeout(stop);
  }
}

async function zoek(term, bearer, diag) {
  const url = ZOEK_URL
    + '?search-term=' + encodeURIComponent(term)
    + '&country-code=NL&page-size=10&include-image=true&include-offer=true';

  const ctrl = new AbortController();
  const stop = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, {
      headers: {
        Authorization: 'Bearer ' + bearer,
        Accept: 'application/json',
        'Accept-Language': 'nl'
      },
      signal: ctrl.signal
    });
    if (diag) diag.zoekStatus = r.status;
    const tekst = await r.text();
    if (!r.ok) {
      if (diag) diag.zoekAntwoord = tekst.slice(0, 400);
      return null;
    }
    return JSON.parse(tekst);
  } catch (e) {
    if (diag) diag.zoekFout = e && e.name ? e.name : 'onbekend';
    return null;
  } finally {
    clearTimeout(stop);
  }
}

// Woorden die erop wijzen dat het om een accessoire gaat in plaats van om
// het product zelf. Op 'aeropress' zet bol de filterzakjes bovenaan, en die
// wil je niet op je kaart met de prijs van het apparaat ernaast.
const BIJZAAK = ['filter', 'navul', 'refill', 'hoes', 'sleeve', 'cover',
  'beschermhoe', 'reserve', 'onderdel', 'accessoire', 'reinig', 'ontkalk',
  'zakjes', 'vervang', 'opzetstuk', 'adapter', 'kabel', 'batterij',
  'etui', 'opbergtas', 'schoonmaak', 'vulling', 'papieren'];

function beste(data, term) {
  const r = data && Array.isArray(data.results) ? data.results : [];
  if (!r.length) return null;

  const t = String(term || '').toLowerCase();
  const woorden = t.split(/\s+/).filter(Boolean);

  let winnaar = null, hoogste = -Infinity;
  r.forEach((p, i) => {
    const titel = String(p.title || '').toLowerCase();
    let punten = 0;
    woorden.forEach((w) => { if (titel.indexOf(w) !== -1) punten += 3; });
    // Alleen straffen als het woord niet zelf in de zoekterm staat, anders
    // zou 'koffiefilter' zichzelf wegstrepen.
    BIJZAAK.forEach((b) => {
      if (titel.indexOf(b) !== -1 && t.indexOf(b) === -1) punten -= 6;
    });
    if (!p.image || !p.image.url) punten -= 10;
    if (!p.offer || p.offer.price == null) punten -= 4;
    punten -= i * 0.1; // bij gelijke stand wint de hoogste in de zoekresultaten
    if (punten > hoogste) { hoogste = punten; winnaar = p; }
  });
  return winnaar;
}

function eersteResultaat(data, term) {
  const p = beste(data, term);
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

function queryUit(req) {
  if (req.query && Object.keys(req.query).length) return req.query;
  try {
    const u = new URL(req.url, 'https://x');
    const o = {};
    u.searchParams.forEach((v, k) => { o[k] = v; });
    return o;
  } catch (e) {
    return {};
  }
}

export default async function handler(req, res) {
  const q = queryUit(req);
  const debug = q.debug === '1';

  const ruw = q.q || '';
  const termen = String(Array.isArray(ruw) ? ruw.join(';') : ruw)
    .split(';')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);

  if (debug) {
    const diag = { termen: termen };
    res.setHeader('Cache-Control', 'no-store');
    const bearer = await haalToken(diag);
    if (bearer && termen.length) {
      diag.antwoord = await zoek(termen[0], bearer, diag);
      diag.genormaliseerd = eersteResultaat(diag.antwoord, termen[0]);
      diag.gevonden = (diag.antwoord && diag.antwoord.results || []).map((x) => x.title);
    }
    diag.gelukt = !!(diag.genormaliseerd && diag.genormaliseerd.afbeelding);
    return res.status(200).json(diag);
  }

  res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
  if (!termen.length) return res.status(200).json({});

  const bearer = await haalToken(null);
  if (!bearer) return res.status(200).json({});

  const uit = {};
  const delen = await Promise.all(termen.map((t) => zoek(t, bearer, null)));
  termen.forEach((t, i) => {
    const p = eersteResultaat(delen[i], t);
    if (p && p.afbeelding) uit[t] = p;
  });

  return res.status(200).json(uit);
}
