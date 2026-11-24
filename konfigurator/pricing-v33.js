/** Midlifeart V33 – sichere Preisberechnung, Original-WMD-Tabellen bleiben in pricing-v31.js. */
'use strict';
const {priceFor: originalPriceFor} = require('./pricing-v31');
const DIVISORS = Object.freeze({private:65, sell:55}); // Marge: 35 % bzw. 45 % vom Verkaufspreis
function priceFor(configuration) {
  // Alle Formate, WMD-Preise, Mengen und Extras weiterhin zentral durch V31 validieren.
  const old = originalPriceFor(configuration);
  const divisor = DIVISORS[old.config.way];
  if (!divisor || !Number.isSafeInteger(old.wmdGrossCents)) {
    throw new Error('Ungültige Marge oder WMD-Preis.');
  }
  const printCents = Math.round(old.wmdGrossCents * 100 / divisor);
  const totalCents = printCents + old.extrasCents;
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    throw new Error('Berechneter Preis ungültig.');
  }
  return {...old, printCents, totalCents, totalEuros:(totalCents/100).toFixed(2),
    orderProperties: {...old.orderProperties,
      'Qualitätskontrolle':old.config.extras.check ? 'Ja (+29 €)' : 'Nein (ohne Druckfreigabe)'
    }
  };
}
module.exports={priceFor};
