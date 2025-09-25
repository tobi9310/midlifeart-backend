// konfigurator/cleanup-products.js
const fetch = require('node-fetch');

const SHOP = '7456d9-4.myshopify.com';
const ADMIN_TOKEN =
  process.env.SHOPIFY_ADMIN_API_TOKEN ||
  process.env.SHOPIFY_ADMIN_TOKEN ||
  process.env.SHOPIFY_ADMIN_API_TOKEN_KONFIGURATOR;

if (!ADMIN_TOKEN) {
  console.warn('⚠️ Kein Admin-Token gefunden.');
}

/** REST-Helper: gibt auch Status + Call-Limit-Header zurück */
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
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }

  if (!res.ok) {
    const msg = json && (json.errors || json.error || json);
    throw new Error(`Shopify ${res.status} ${path}: ${JSON.stringify(msg)}`);
  }

  return {
    json,
    link: res.headers.get('link') || '',
    callLimit: res.headers.get('x-shopify-shop-api-call-limit') || '',
    status: res.status,
  };
}

/** Erste Seite (Sample) holen – ohne Filter */
async function listSample(limit = 20) {
  const fields = [
    'id','title','tags','status','created_at','published_scope','handle'
  ].join(',');
  const { json, callLimit } = await rest(`/products.json?limit=${limit}&status=any&fields=${fields}`);
  const products = json.products || [];
  // Aufbereiten inkl. Roh-Tags
  const sample = products.map(p => ({
    id: p.id,
    title: p.title,
    status: p.status,
    published_scope: p.published_scope,
    rawTags: typeof p.tags === 'string' ? p.tags : '',
  }));
  return { sample, sampleCount: sample.length, callLimit };
}

/** Alle Produkte paginiert (nur für Kandidatensuche) */
async function listAllProducts(limitPerPage = 250, maxPages = 40) {
  const all = [];
  let pageInfo = null;
  let pages = 0;
  do {
    const qp = new URLSearchParams({ limit: String(limitPerPage), status: 'any' });
    if (pageInfo) qp.append('page_info', pageInfo);
    const { json, link } = await rest(`/products.json?${qp.toString()}`);
    all.push(...(json.products || []));
    const m = link && link.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>; rel="next"/);
    pageInfo = m ? m[1] : null;
    pages += 1;
  } while (pageInfo && pages < maxPages);
  return all;
}

/** Kandidaten mit Markierungs-Tags */
async function listCandidates() {
  const products = await listAllProducts();
  return products
    .map(p => {
      const rawTags = typeof p.tags === 'string' ? p.tags : '';
      const tagsArr = rawTags.split(',').map(t => t.trim()).filter(Boolean);
      return { id: p.id, title: p.title, tags: tagsArr, rawTags };
    })
    .filter(p => p.tags.includes('auto-delete-1h') || p.tags.includes('configurator-hidden'));
}

/** Löschen per REST */
async function deleteProduct(id) {
  await rest(`/products/${id}.json`, { method: 'DELETE' });
}

/** Hauptfunktion: findet & löscht */
async function cleanupProducts() {
  const found = await listCandidates();
  let deleted = 0;
  for (const p of found) {
    try {
      await deleteProduct(p.id);
      deleted++;
    } catch (e) {
      console.warn('⚠️ Konnte Produkt nicht löschen:', p.id, e?.message || e);
    }
  }
  return { found: found.length, deleted };
}

/** Diagnose/Scan: Kandidaten + Sample der ersten Produkte zurückgeben */
async function scanMarked() {
  const [sampleInfo, candidates] = await Promise.all([
    listSample(20),
    listCandidates(),
  ]);
  return {
    candidates,
    sample: sampleInfo.sample,
    sampleCount: sampleInfo.sampleCount,
    callLimit: sampleInfo.callLimit,
    usingTokenEnv:
      (process.env.SHOPIFY_ADMIN_API_TOKEN && 'SHOPIFY_ADMIN_API_TOKEN') ||
      (process.env.SHOPIFY_ADMIN_TOKEN && 'SHOPIFY_ADMIN_TOKEN') ||
      (process.env.SHOPIFY_ADMIN_API_TOKEN_KONFIGURATOR && 'SHOPIFY_ADMIN_API_TOKEN_KONFIGURATOR') ||
      'UNKNOWN',
  };
}

module.exports = { cleanupProducts, scanMarked };
