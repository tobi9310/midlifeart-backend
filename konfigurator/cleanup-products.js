// konfigurator/cleanup-products.js
// Löscht SOFORT alle Produkte mit Tag "auto-delete-1h" ODER "configurator-hidden".
// Zusätzlich: Diagnose-/Scan-Endpunkte liefern Rohdaten (inkl. Tags & Call-Limit).

const fetch = require('node-fetch');

const SHOP = '7456d9-4.myshopify.com';

// Nimm zuerst SHOPIFY_ADMIN_API_TOKEN, sonst den KONFIGURATOR-Token
const ADMIN_TOKEN =
  process.env.SHOPIFY_ADMIN_API_TOKEN || process.env.SHOPIFY_ADMIN_API_TOKEN_KONFIGURATOR;

if (!ADMIN_TOKEN) {
  console.warn(
    '⚠️ Kein Admin-Token gefunden. Setze SHOPIFY_ADMIN_API_TOKEN oder SHOPIFY_ADMIN_API_TOKEN_KONFIGURATOR!'
  );
}

/** REST-Helper: führt Request aus, gibt JSON + Link/Call-Limit-Header zurück */
async function rest(path, opts = {}) {
  const res = await fetch(`https://${SHOP}/admin/api/2023-10${path}`, {
    headers: {
      'X-Shopify-Access-Token': ADMIN_TOKEN,
      'Content-Type': 'application/json',
    },
    ...opts,
  });

  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const msg = json && (json.errors || json.error || json);
    throw new Error(`Shopify ${res.status} ${path}: ${JSON.stringify(msg)}`);
  }

  return {
    json,
    link: res.headers.get('link') || '',
    callLimit: res.headers.get('x-shopify-shop-api-call-limit') || '', // z.B. "1/40"
  };
}

/* -------------------------------------------------------------------------- */
/*  ROBUSTE LISTING-FUNKTIONEN (KEINE FILTER/FIELDS, VOLLE DATEN)            */
/* -------------------------------------------------------------------------- */

/** Holt die ersten N Produkte (volle Objekte) – für Diagnose */
async function listSample(limit = 20) {
  const { json, callLimit } = await rest(`/products.json?limit=${encodeURIComponent(limit)}`);
  const products = json.products || [];
  const sample = products.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    published_scope: p.published_scope,
    rawTags: typeof p.tags === 'string' ? p.tags : '',
  }));
  return { sample, sampleCount: sample.length, callLimit };
}

/** Lädt ALLE Produkte paginiert (volle Objekte) – für Cleanup */
async function listAllProducts(limitPerPage = 250, maxPages = 40) {
  const all = [];
  let pageInfo = null;
  let pages = 0;

  do {
    const qp = new URLSearchParams({ limit: String(limitPerPage) });
    if (pageInfo) qp.append('page_info', pageInfo);

    const { json, link } = await rest(`/products.json?${qp.toString()}`);
    all.push(...(json.products || []));

    const m = link && link.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>; rel="next"/);
    pageInfo = m ? m[1] : null;
    pages += 1;
  } while (pageInfo && pages < maxPages);

  return all;
}

/* -------------------------------------------------------------------------- */
/*  SCAN & CLEANUP                                                           */
/* -------------------------------------------------------------------------- */

/** findet Produkte mit Marker-Tag(s) */
async function listCandidates() {
  const products = await listAllProducts();

  const out = [];
  for (const p of products) {
    const rawTags = typeof p.tags === 'string' ? p.tags : '';
    // Shopify liefert Tags als Komma-String
    const tagsArr = rawTags.split(',').map((t) => t.trim()).filter(Boolean);

    const isMarked = tagsArr.includes('auto-delete-1h') || tagsArr.includes('configurator-hidden');
    if (isMarked) {
      out.push({ id: p.id, title: p.title, tags: tagsArr });
    }
  }
  return out;
}

/** per REST löschen */
async function deleteProduct(id) {
  await rest(`/products/${id}.json`, { method: 'DELETE' });
}

/** Hauptfunktion: markierte Produkte löschen */
async function cleanupProducts() {
  const found = await listCandidates();
  let deleted = 0;

  for (const p of found) {
    try {
      console.log('🧹 Lösche:', p.id, p.title, p.tags);
      await deleteProduct(p.id);
      deleted++;
    } catch (e) {
      console.warn('⚠️ Konnte Produkt nicht löschen:', p.id, e?.message || e);
    }
  }

  console.log(`Cleanup fertig: gefunden=${found.length}, gelöscht=${deleted}`);
  return { found: found.length, deleted };
}

/** Debug: zeigt Kandidaten + ein Sample der ersten Produkte (roh) */
async function scanMarked() {
  const [candidates, { sample, sampleCount, callLimit }] = await Promise.all([
    listCandidates(),
    listSample(20),
  ]);
  return { candidates, sample, sampleCount, callLimit, usingTokenEnv: ADMIN_TOKEN ? (process.env.SHOPIFY_ADMIN_API_TOKEN ? 'SHOPIFY_ADMIN_API_TOKEN' : 'SHOPIFY_ADMIN_API_TOKEN_KONFIGURATOR') : 'NONE' };
}

/** Diagnose: nur minimaler Ping + Titelliste (ohne Tags) */
async function diag() {
  const { sample, sampleCount, callLimit } = await listSample(10);
  return {
    ok: true,
    shop: SHOP,
    usingTokenEnv: process.env.SHOPIFY_ADMIN_API_TOKEN ? 'SHOPIFY_ADMIN_API_TOKEN' : 'SHOPIFY_ADMIN_API_TOKEN_KONFIGURATOR',
    apiStatus: '200',
    sampleCount,
    sampleTitles: sample.map((s) => s.title),
    callLimit,
    error: null,
  };
}

module.exports = { cleanupProducts, scanMarked, diag };
