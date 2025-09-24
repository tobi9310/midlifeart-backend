// konfigurator/create-product.js
// Legt ein unsichtbares (DRAFT) Konfigurator-Produkt an,
// markiert es und gibt IDs zurück (inkl. legacyVariantId für /cart/add.js)

const fetch = require('node-fetch'); // passt zu deinem server.js

const SHOP = '7456d9-4.myshopify.com'; // wie in deinem server.js genutzt
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN_KONFIGURATOR; // bestehende ENV-Variable weiterverwenden

async function shopifyGraphQL(query, variables = {}) {
  const res = await fetch(`https://${SHOP}/admin/api/2024-07/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': ADMIN_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

/**
 * createProduct({ title, price })
 * - erstellt Produkt als DRAFT (unsichtbar)
 * - setzt Tags & Metafelder (auto-delete nach 60 Min)
 * - gibt { productId, variantId, legacyVariantId } zurück
 */
async function createProduct({ title, price }) {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // +60 Min

  const mutation = `
    mutation CreateConfiguratorProduct($input: ProductInput!) {
      productCreate(input: $input) {
        product {
          id
          title
          status
          tags
          variants(first: 1) { nodes { id legacyResourceId } }
          metafields(first: 5, namespace: "midlifeart") { nodes { key value type } }
        }
        userErrors { field message }
      }
    }`;

  const input = {
    title: `Konfigurator: ${title}`,
    status: "DRAFT", // sofort unsichtbar
    tags: ["configurator-hidden","auto-delete-1h"],
    variants: [{ price: String(price) }],
    metafields: [
      { namespace: "midlifeart", key: "expires_at", type: "date_time", value: expiresAt },
      { namespace: "midlifeart", key: "created_by", type: "single_line_text_field", value: "konfigurator" }
    ]
  };

  const data = await shopifyGraphQL(mutation, { input });
  const err = data.productCreate.userErrors?.[0];
  if (err) throw new Error(`Shopify error: ${err.field} ${err.message}`);

  const product = data.productCreate.product;
  const variant = product.variants.nodes[0];

  return {
    productId: product.id,
    variantId: variant.id, // GID
    legacyVariantId: variant.legacyResourceId // numerisch – für /cart/add.js
  };
}

module.exports = { createProduct };
