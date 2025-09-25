// konfigurator/cleanup-products.js
// Löscht SOFORT alle Produkte mit Tag "auto-delete-1h" ODER "configurator-hidden"
// (keine Altersprüfung). Nutzt das gleiche Admin-Token wie der Konfigurator.

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

/** Kandidaten einsammeln (Marker-Tag vorhanden) */
async function listCandidates() {
  const out = [];
  let pageInfo = null;

  do {
    const qp = new URLSearchParams({
      limit: '250',
      status: 'any' // alle Produkte berücksichtigen
    });
    if (pageInfo) qp.append('page_info', pageInfo);

    const { json, link } = await rest(`/products.json?${qp.toString()}`);
    const products = json.products || [];

    for (const p of products) {
      const tagsArr = (p.tags || '').split(',').map(t => t.trim()).filter(Boolean);

      const isMarked =
        tagsArr.includes('auto-delete-1h') || tagsArr.includes('configurator-hidden');

      if (isMarked) {
        out.push({ id: p.id, title: p.title, tags: tagsArr });
      }
    }

    // Cursor für nächste Seite (falls >250 Produkte)
    const m = link && link.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>; rel="next"/);
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
      console.log('🧹 Lösche:', p.id, p.title, p.tags);
      await deleteProduct(p.id);
      deleted++;
    } catch (e) {
      console.warn('⚠️ Konnte Produkt nicht löschen:', p.id, e.message || e);
    }
  }

  console.log(`Cleanup fertig: gefunden=${found.length}, gelöscht=${deleted}`);
  return { found: found.length, deleted };
}

/** Debug: zeigt nur die Kandidaten, löscht NICHT */
async function scanMarked() {
  const found = await listCandidates();
  console.log('🔎 Scan: Kandidaten=', found);
  return found;
}

module.exports = { cleanupProducts, scanMarked };
