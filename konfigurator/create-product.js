// konfigurator/create-product.js
// Vereinfacht: erstellt Draft-Produkt mit Tags (keine Metafelder).

const fetch = require('node-fetch');

const SHOP = '7456d9-4.myshopify.com';
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN_KONFIGURATOR;

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

async function createProduct({ title, price }) {
  const mutation = `
    mutation CreateConfiguratorProduct($input: ProductInput!) {
      productCreate(input: $input) {
        product {
          id
          title
          status
          tags
          createdAt
          variants(first: 1) { nodes { id legacyResourceId } }
        }
        userErrors { field message }
      }
    }`;

  const input = {
    title: `Konfigurator: ${title}`,
    status: "DRAFT",                              // sofort unsichtbar
    tags: ["configurator-hidden", "auto-delete-1h"],
    variants: [{ price: String(price) }]
  };

  const data = await shopifyGraphQL(mutation, { input });
  const err = data.productCreate.userErrors?.[0];
  if (err) throw new Error(`Shopify error: ${err.field} ${err.message}`);

  const product = data.productCreate.product;
  const variant = product.variants.nodes[0];

  return {
    productId: product.id,
    variantId: variant.id,
    legacyVariantId: variant.legacyResourceId
  };
}

module.exports = { createProduct };
