// konfigurator/create-product.js
// Erstellt ein aktives, kaufbares Produkt per REST-API,
// markiert es mit Tags und (optional) veröffentlicht es für den Onlineshop.
// Rückgabe enthält die Variant-ID (legacyVariantId) für /cart/add.js.

const fetch = require('node-fetch');

const SHOP = '7456d9-4.myshopify.com'; // deine Shop-Domain
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN_KONFIGURATOR; // ENV-Token

/** Hilfsfunktion: REST-Call */
async function shopify(path, opts = {}) {
  const res = await fetch(`https://${SHOP}/admin/api/2023-10${path}`, {
    headers: {
      'X-Shopify-Access-Token': ADMIN_TOKEN,
      'Content-Type': 'application/json'
    },
    ...opts
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) {
    const msg = json && (json.errors || json.error || json);
    throw new Error(`Shopify REST ${res.status}: ${JSON.stringify(msg)}`);
  }
  return json;
}

/** Produkt im Onlineshop veröffentlichen (Publication "Online Store") */
async function publishToOnlineStore(productId) {
  const pubs = await shopify('/publications.json');
  const online = (pubs.publications || []).find(p => p.name === 'Online Store');
  if (!online) {
    console.warn('⚠️ Keine "Online Store"-Publication gefunden.', pubs);
    return;
  }
  await shopify(`/publications/${online.id}/published_products.json`, {
    method: 'POST',
    body: JSON.stringify({ published_product: { product_id: productId } })
  });
}

/**
 * createProduct({ title, price })
 * - legt aktives Produkt an (kaufbar)
 * - setzt Tags (configurator-hidden, auto-delete-1h)
 * - Variante ohne Bestandstracking + „continue“
 * - versucht Veröffentlichung im Online Store (Fehler werden geloggt, aber nicht geworfen)
 * - liefert IDs inkl. Variant-ID zurück
 */
async function createProduct({ title, price }) {
  // 1) Produkt anlegen
  const created = await shopify('/products.json', {
    method: 'POST',
    body: JSON.stringify({
      product: {
        title: `Konfigurator: ${title}`,
        status: 'active', // aktiv = kaufbar
        tags: 'configurator-hidden,auto-delete-1h',
        variants: [
          {
            price: String(price),
            inventory_management: null,   // kein Bestands-Tracking
            inventory_policy: 'continue'  // Verkauf auch bei 0
          }
        ]
      }
    })
  });

  if (!created || !created.product) {
    throw new Error('❌ Produkt wurde nicht zurückgegeben: ' + JSON.stringify(created));
  }

  const product = created.product;
  const variant = (product.variants && product.variants[0]) || null;
  if (!variant) throw new Error('❌ Keine Variante erhalten.');

  // 2) Für Onlineshop veröffentlichen – NICHT blockierend
  try {
    await publishToOnlineStore(product.id);
  } catch (e) {
    console.warn('⚠️ Publish fehlgeschlagen (ignoriere):', e?.message || e);
  }

  // 3) Ergebnis zurückgeben → wichtig: legacyVariantId = Variant-ID
  return {
    productId: product.id,       // Produkt-ID (REST)
    variantId: variant.id,       // Variant-ID (REST)
    legacyVariantId: variant.id  // fürs /cart/add.js
  };
}

module.exports = { createProduct };
