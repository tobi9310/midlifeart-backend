// konfigurator/create-product.js
// Erstellt ein aktives, kaufbares Produkt per REST-API,
// markiert es mit Tags und veröffentlicht es für den Onlineshop.
// Rückgabe enthält legacyVariantId für /cart/add.js.

const fetch = require('node-fetch');

const SHOP = '7456d9-4.myshopify.com'; // deine Shop-Domain
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN_KONFIGURATOR; // bestehende ENV

/** Hilfsfunktion: REST-Call */
async function shopify(path, opts = {}) {
  const res = await fetch(`https://${SHOP}/admin/api/2023-10${path}`, {
    headers: {
      'X-Shopify-Access-Token': ADMIN_TOKEN,
      'Content-Type': 'application/json'
    },
    ...opts
  });
  const text = await res.text(); // erst als Text lesen für bessere Fehlersicht
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
  // 1) Publications laden
  const pubs = await shopify('/publications.json');
  const online = (pubs.publications || []).find(p => p.name === 'Online Store');
  if (!online) {
    console.warn('⚠️ Keine "Online Store"-Publication gefunden.', pubs);
    return;
  }
  // 2) Produkt veröffentlichen
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
 * - veröffentlicht fürs Frontend (Online Store)
 * - liefert IDs inkl. legacyVariantId zurück
 */
async function createProduct({ title, price }) {
  // 1) Produkt anlegen (REST)
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

  // 2) Für Onlineshop veröffentlichen (damit /cart/add.js sicher geht)
  await publishToOnlineStore(product.id);

  // 3) Ergebnis zurückgeben
  return {
    productId: product.id,         // numerische Produkt-ID (REST)
    variantId: variant.id,         // numerische Varianten-ID (REST)
    legacyVariantId: variant.id    // = dieselbe ID; fürs /cart/add.js verwenden
  };
}

module.exports = { createProduct };
