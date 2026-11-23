/**
 * Midlifeart - Preisanpassung auf Basis des bisherigen, validierten V31-Rechners.
 * Ablage: konfigurator/pricing-v32.js (NEU, pricing-v31.js BLEIBT UNVERÄNDERT)
 * Dieser Adapter ersetzt keine Tabellen, Margen, Mengenregeln oder weiteren Optionen.
 */
'use strict';
const { priceFor: originalPriceFor } = require('./pricing-v31');
const INCLUDED_PRINT_PREPARATION_CENTS = 1700;
const PREVIOUS_OPTIONAL_CHECK_CENTS = 2900;

function priceFor(configuration) {
  // Die Prüfung ist unabhängig vom Browserverhalten immer enthalten.
  const incoming = configuration && typeof configuration === 'object' ? configuration : {};
  const extras = incoming.extras && typeof incoming.extras === 'object' ? incoming.extras : {};
  const base = { ...incoming, extras: { ...extras, check: false } };
  const included = { ...incoming, extras: { ...extras, check: true } };

  // Beide Pfade gehen durch dieselbe serverseitige V31-Validierung.
  const noCheckResult = originalPriceFor(base);
  const withCheckResult = originalPriceFor(included);
  if (!Number.isSafeInteger(noCheckResult.totalCents) ||
      !Number.isSafeInteger(withCheckResult.totalCents) ||
      withCheckResult.totalCents - noCheckResult.totalCents !== PREVIOUS_OPTIONAL_CHECK_CENTS) {
    throw new Error('Preismodell fuer die enthaltene Druckdatenpruefung ist nicht konsistent.');
  }

  // Alte Druckpreise + 17 € pro Auftrag; bisheriger Check-Aufpreis entfällt.
  const totalCents = noCheckResult.totalCents + INCLUDED_PRINT_PREPARATION_CENTS;
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    throw new Error('Ungueltiger Buchdruckpreis.');
  }
  return {
    ...withCheckResult,
    totalCents,
    totalEuros: (totalCents / 100).toFixed(2),
    // orderProperties der geprüften V31-Konfiguration bleiben erhalten:
    // Die Qualitätskontrolle wird darin weiterhin als enthalten/aktiv übergeben.
  };
}
module.exports = { priceFor };
