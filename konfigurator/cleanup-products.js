// konfigurator/cleanup-products.js
// Löscht SOFORT alle Produkte mit Tag "auto-delete-1h" ODER "configurator-hidden".
// Zusätzlich: Debug-Scan (liefert Kandidaten + Sample der ersten Produkte).

const fetch = require('node-fetch');

const SHOP = '7456d9-4.myshopify.com';

// WICHTIG: Cleanup nutzt bewusst den "großen" Admin-Token
// (der auch bei /get-projekte funktioniert), nicht den Konfigurator-Token.
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;

if (!ADMIN_TOKEN) {
  console.warn('⚠️ SHOPIFY_ADMIN_API_TOKEN ist nicht gesetzt – Cleanup kann keine Produkte lesen/löschen.');
}

/** Minimaler REST-Helper (liest Link-Header für Cursor-Pagination) */
async function rest(path, opts = {}) {
  const res = await fetch(`https://${SHOP}/admin/api/2023-10${path}`, {
    headers: {
      'X-Shopify-Access-Token': ADMIN_TOKEN,
      'Content-Type': 'application/json'
    },
    ...opts
  });

  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }

  if (!res.ok) {
    const msg = json && (json.errors || json.error || json);
    throw new Error(`Shopify ${res.status} ${path}: ${JSON.stringify(msg)}`);
  }
  return { json, link: res.headers.get('link') || '' };
}

/** Alle Produkte paginiert holen (ohne Filter, damit tags sicher mitkommen) */
async function listAllProducts(limitPerPage = 250, maxPages = 40) {
  const all = [];
  let pageInfo = null;
  let pages = 0;

  do {
    const qp = new URLSearchParams({ limit: String(limitPerPage), status: 'any' });
    if (pageInfo) qp.append('page_info', pageInfo);

    const { json, link } = await rest(`/products.json?${qp.toString()}`);
    const products = json.products || [];
    all.push(...products);

    const m = link && link.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>; rel="next"/);
    pageInfo = m ? m[1] : null;
    pages += 1;
  } while (pageInfo && pages < maxPages);

  return all;
}

/** Kandidaten: Produkte mit Marker-Tag */
async function listCandidates() {
  const products = await listAllProducts();
  const out = [];

  for (const p of products) {
    // Shopify liefert tags als kommagetrennten String
    const rawTags = typeof p.tags === 'string' ? p.tags : '';
    const tagsArr = rawTags.split(',').map(t => t.trim()).filter(Boolean);

    const isMarked =
      tagsArr.includes('auto-delete-1h') || tagsArr.includes('configurator-hidden');

    if (isMarked) {
      out.push({ id: p.id, title: p.title, tags: tagsArr });
    }
  }
  return out;
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

/** Debug-Scan: zeigt Kandidaten + Sample der ersten N Produkte (roh) */
async function scanMarked(sampleSize = 20) {
  const products = await listAllProducts();
  const candidates = [];
  const sample = [];

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const rawTags = typeof p.tags === 'string' ? p.tags : '';
    const tagsArr = rawTags.split(',').map(t => t.trim()).filter(Boolean);
    const isMarked =
      tagsArr.includes('auto-delete-1h') || tagsArr.includes('configurator-hidden');

    if (isMarked) {
      candidates.push({ id: p.id, title: p.title, tags: tagsArr });
    }
    if (sample.length < sampleSize) {
      sample.push({ id: p.id, title: p.title, rawTags });
    }
  }

  return { candidates, sample };
}

module.exports = { cleanupProducts, scanMarked };
