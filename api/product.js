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
    + '&country-code=NL&page-size=1&include-image=true&include-offer=true';

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
      diag.genormaliseerd = eersteResultaat(diag.antwoord);
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
    const p = eersteResultaat(delen[i]);
    if (p && p.afbeelding) uit[t] = p;
  });

  return res.status(200).json(uit);
}
