// konfigurator/cleanup-products.js
// Löscht Produkte mit Tag "auto-delete-1h", die älter als 60 Minuten sind.
// Nutzt dieselben ENV-Variablen wie der Rest: SHOPIFY_ADMIN_API_TOKEN_KONFIGURATOR

const fetch = require('node-fetch');

const SHOP = '7456d9-4.myshopify.com';
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN_KONFIGURATOR;

/** REST-Helper (liest auch Link-Header für Cursor-Pagination) */
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

/** Kandidaten einsammeln (älter als 60 Min + Tag auto-delete-1h + Titel beginnt mit "Konfigurator:") */
async function listCandidates() {
  const cutoffISO = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const out = [];
  let pageInfo = null;

  do {
    const qp = new URLSearchParams({
      limit: '250',
      status: 'any',
      fields: 'id,title,tags,created_at,status'
    });
    qp.append('created_at_max', cutoffISO);
    if (pageInfo) qp.append('page_info', pageInfo);

    const { json, link } = await rest(`/products.json?${qp.toString()}`);
    const products = json.products || [];

    for (const p of products) {
      const tags = (p.tags || '').split(',').map(t => t.trim());
      const hasTag = tags.includes('auto-delete-1h');
      const isConfigurator = /^Konfigurator:/i.test(p.title || '');
      const isOld = new Date(p.created_at) < new Date(cutoffISO);
      if (hasTag && isConfigurator && isOld) out.push({ id: p.id, title: p.title });
    }

    const m = link.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>; rel="next"/);
    pageInfo = m ? m[1] : null;
  } while (pageInfo);

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
      await deleteProduct(p.id);
      deleted++;
    } catch (e) {
      console.warn('⚠️ Konnte Produkt nicht löschen:', p.id, e.message || e);
    }
  }
  return { found: found.length, deleted };
}

module.exports = { cleanupProducts };
