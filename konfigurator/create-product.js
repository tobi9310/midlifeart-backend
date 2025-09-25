// konfigurator/create-product.js
// Erstellt ein aktives, kaufbares Produkt per REST-API
// und markiert es mit den Tags für Hidden & Cleanup.
// Rückgabe enthält die Variant-ID (legacyVariantId) für /cart/add.js.

const fetch = require('node-fetch');

const SHOP = '7456d9-4.myshopify.com';
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN_KONFIGURATOR;

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

async function createProduct({ title, price }) {
  const created = await shopify('/products.json', {
    method: 'POST',
    body: JSON.stringify({
      product: {
        title: `Konfigurator: ${title}`,
        status: 'active',
        tags: 'configurator-hidden,auto-delete-1h',
        variants: [
          {
            price: String(price),
            inventory_management: null,
            inventory_policy: 'continue'
          }
        ]
      }
    })
  });

  if (!created || !created.product) {
    throw new Error('❌ Produkt wurde nicht zurückgegeben: ' + JSON.stringify(created));
  }

  const product = created.product;
  const variant = product.variants?.[0];
  if (!variant) throw new Error('❌ Keine Variante erhalten.');

  // Ergebnis zurück
  return {
    productId: product.id,
    variantId: variant.id,
    legacyVariantId: variant.id // fürs /cart/add.js
  };
}

module.exports = { createProduct };
