// konfigurator/create-product.js
// Nutzt Shopify REST-API, erstellt Draft-Produkt mit Tags.

const fetch = require('node-fetch');

const SHOP = '7456d9-4.myshopify.com';
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN_KONFIGURATOR;

async function createProduct({ title, price }) {
  const response = await fetch(`https://${SHOP}/admin/api/2023-10/products.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': ADMIN_TOKEN
    },
    body: JSON.stringify({
      product: {
        title: `Konfigurator: ${title}`,
        status: "active",   // aktiviert
        tags: "configurator-hidden,auto-delete-1h",
        variants: [
          { price: price }
        ]
      }
    })
  });

  const data = await response.json();

  if (!data.product) {
    throw new Error("❌ Kein Produkt zurückgegeben: " + JSON.stringify(data));
  }

  const variant = data.product.variants[0];

  return {
    productId: data.product.id,
    variantId: variant.id,
    legacyVariantId: variant.id // REST liefert gleich die Zahl, die wir brauchen
  };
}

module.exports = { createProduct };
