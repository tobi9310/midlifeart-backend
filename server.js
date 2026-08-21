/**
 * server.js — Midlifeart Backend (Render)
 * Stabiler Mailversand via Brevo HTTP API (kein SMTP)
 */

const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");
const cors = require("cors");
const multer = require("multer");

const { createProduct } = require("./konfigurator/create-product");
const { cleanupProducts, scanMarked } = require("./konfigurator/cleanup-products");

const app = express();
const port = process.env.PORT || 3000;

// Multer: Memory Storage (Uploads im RAM)
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

/** ENV Defaults */
const SENDER_EMAIL = process.env.SENDER_EMAIL || "info@midlifeart.de";
const RECEIVER_EMAIL = process.env.RECEIVER_EMAIL || "buchdruck@midlifeart.de";
const CONTACT_RECEIVER_EMAIL = process.env.CONTACT_RECEIVER_EMAIL || "info@midlifeart.de";
const BREVO_API_KEY = process.env.BREVO_API_KEY;

/** --- Brevo Mail Helper (HTTP API) --- */
async function sendBrevoMail({ to, subject, text, html, replyTo, attachments = [] }) {
  if (!BREVO_API_KEY) {
    throw new Error("BREVO_API_KEY missing in environment variables.");
  }

  const payload = {
    sender: { name: "Midlifeart", email: SENDER_EMAIL },
    to: [{ email: to }],
    subject: subject || "(ohne Betreff)",
  };

  if (replyTo) payload.replyTo = { email: replyTo };

  // Brevo akzeptiert textContent ODER htmlContent
  if (html) payload.htmlContent = html;
  else payload.textContent = text || "";

  // Attachments: [{ name, content(base64) }]
  if (attachments.length > 0) {
    payload.attachment = attachments.map((a) => ({
      name: a.name,
      content: a.contentBase64,
    }));
  }

const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": BREVO_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const errTxt = await r.text().catch(() => "");
    throw new Error(`Brevo send failed (${r.status}): ${errTxt}`);
  }
}

/** Optional: Attachment-Größenlimit (Brevo/Deliverability) */
const MAX_ATTACH_BYTES = 20 * 1024 * 1024; // 20MB

function totalBytes(files = []) {
  return files.reduce((sum, f) => sum + (f?.size || 0), 0);
}

/** Helper: AGB akzeptiert? (Checkbox kann "true" oder "on" sein) */
function isAgbAccepted(value) {
  const v = String(value ?? "").toLowerCase().trim();
  return v === "true" || v === "on" || v === "1" || v === "yes";
}

/** ------------------------------
 *  ROUTES
 *  ------------------------------ */

/** Auszahlungskonto-Formular */
app.post("/submit", upload.none(), async (req, res) => {
  try {
    const formData = req.body || {};
    const labels = { kontoinhaber: "Kontoinhaber", bank: "Bank", iban: "IBAN" };

    let text = "Neue Auszahlungskonto Übermittlung:\n\n";
    for (const key in formData) {
      const label = labels[key] || key;
      text += `${label}: ${formData[key]}\n`;
    }

    await sendBrevoMail({
      to: RECEIVER_EMAIL,
      subject: "Neue Bankdaten vom Kunden",
      text,
    });

    res.status(200).json({ message: "E-Mail erfolgreich gesendet." });
  } catch (error) {
    console.error("Fehler bei /submit:", error);
    res.status(500).json({ error: "Fehler beim E-Mail-Versand." });
  }
});

/** Druckdaten Upload (Cover+Inhalt+Autorenbild optional) */
app.post(
  "/upload",
  upload.fields([
    { name: "cover", maxCount: 1 },
    { name: "inhalt", maxCount: 1 },
    { name: "autorenbild", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const data = req.body || {};
      const files = req.files || {};

      // ✅ AGB Pflichtprüfung (serverseitig)
      if (!isAgbAccepted(data.agbAccepted)) {
        console.log("🛑 Druckdaten blockiert: AGB nicht akzeptiert");
        return res.status(400).json({
          error: "Bitte akzeptiere die AGB, um fortzufahren.",
        });
      }

      // ✅ Pflichtdateien prüfen (serverseitig)
      const cover = files.cover?.[0];
      const inhalt = files.inhalt?.[0];
      const autorenbild = files.autorenbild?.[0];

      if (!cover || !inhalt) {
        return res.status(400).json({
          error: "Bitte lade Buchcover (PDF) und Buchinhalt (PDF) hoch.",
        });
      }

      // ✅ Wenn Autorendruck (Inklusivleistungen = Ja), müssen Inserat-Pflichtfelder vorhanden sein
      const istAutorendruck = String(data.inklusivleistungen || "").trim().toLowerCase() === "ja";
      if (istAutorendruck) {
        const requiredFields = [
          ["buchtitel", "Bitte trage den Buchtitel ein."],
          ["verkaufspreis", "Bitte trage den Verkaufspreis ein."],
          ["genre", "Bitte wähle ein Genre aus."],
          ["inhaltsangabe", "Bitte trage eine Buchbeschreibung ein."],
          ["autorname", "Bitte trage den Autor:innenname ein."],
        ];

        for (const [key, msg] of requiredFields) {
          if (!String(data[key] || "").trim()) {
            return res.status(400).json({ error: msg });
          }
        }
      }

      // Mailtext bauen
      let text = "Neuer Druckdaten-Upload (Kundenbereich):\n\n";
      text += `Inklusivleistungen: ${data.inklusivleistungen || "-"}\n`;
      text += `Bestellnummer: ${data.bestellnummer || "-"}\n`;
      text += `Buchtitel: ${data.buchtitel || "-"}\n`;
      text += `Verkaufspreis: ${data.verkaufspreis || "-"}\n`;
      text += `Genre: ${data.genre || "-"}\n`;
      text += `Buchbeschreibung: ${data.inhaltsangabe || "-"}\n`;
      text += `Autor:innenname: ${data.autorname || "-"}\n`;
      text += `Autoreninfo: ${data.autoreninfo || "-"}\n`;
      text += `Kontakt-E-Mail: ${data.contactEmail || "-"}\n`;

      text += `\n--- Dateien ---\n`;
      text += `Buchcover: ${cover?.originalname || "-"}\n`;
      text += `Buchinhalt: ${inhalt?.originalname || "-"}\n`;
      text += `Autorenbild: ${autorenbild?.originalname || "-"}\n`;

      // Attachments (Base64)
      const att = [];
      const fileList = [cover, inhalt, autorenbild].filter(Boolean);

      if (totalBytes(fileList) > MAX_ATTACH_BYTES) {
        text += `\n⚠️ Hinweis: Anhänge waren größer als ${MAX_ATTACH_BYTES / (1024 * 1024)}MB und wurden nicht als Mail-Anhang versendet.\n`;
      } else {
        att.push({ name: cover.originalname, contentBase64: cover.buffer.toString("base64") });
        att.push({ name: inhalt.originalname, contentBase64: inhalt.buffer.toString("base64") });
        if (autorenbild) att.push({ name: autorenbild.originalname, contentBase64: autorenbild.buffer.toString("base64") });
      }

      await sendBrevoMail({
        to: RECEIVER_EMAIL,
        subject: "Neuer Druckdaten-Upload vom Kunden",
        text,
        replyTo: data.contactEmail || undefined,
        attachments: att,
      });

      res.status(200).json({ message: "Upload erfolgreich übermittelt." });
    } catch (error) {
      console.error("Fehler bei /upload:", error);
      res.status(500).json({ error: "Upload fehlgeschlagen." });
    }
  }
);

/** Buchinserat-Formular (optional Autor:innenbild) */
app.post("/inserat", upload.single("autorenbild"), async (req, res) => {
  try {
    const formData = req.body || {};
    const datei = req.file;

    const labels = {
      buchtitel: "Buchtitel",
      inhaltsangabe: "Inhaltsangabe",
      autorenname: "Autor:innenname",
      autoreninfo: "Autoreninfo",
      verkaufspreis: "Verkaufspreis",
      genre: "Genre",
      contactEmail: "Kontakt-E-Mail",
    };

    let text = "Neues Buchinserat vom Kunden:\n\n";
    for (const key in formData) {
      const label = labels[key] || key;
      text += `${label}: ${formData[key]}\n\n`;
    }

    const attachments = [];
    if (datei && datei.buffer && datei.size <= MAX_ATTACH_BYTES) {
      attachments.push({
        name: datei.originalname || "autorenbild.jpg",
        contentBase64: datei.buffer.toString("base64"),
      });
    } else if (datei) {
      text += "\n⚠️ Hinweis: Autorenbild war zu groß und wurde nicht als Anhang versendet.\n";
    }

    await sendBrevoMail({
      to: RECEIVER_EMAIL,
      subject: "Neues Buchinserat eingegangen",
      text,
      replyTo: formData.contactEmail || undefined,
      attachments,
    });

    res.status(200).json({ message: "Inserat erfolgreich gesendet." });
  } catch (error) {
    console.error("Fehler bei /inserat:", error);
    res.status(500).json({ error: "Fehler beim Inserat-Versand." });
  }
});

/** Cover-Briefing Formular (multipart/form-data) */
app.post("/cover-order", upload.array("files", 20), async (req, res) => {
  try {
    const {
      name = "-",
      orderNumber = "-",
      bookTitle = "-",
      blurb = "-",
      notes = "-",
      contactEmail = "-",
    } = req.body || {};

    const files = req.files || [];

    let text =
      `Neues Cover-Briefing (Kundenbereich)\n` +
      `Absender:        ${name}\n` +
      `Bestellnummer:   ${orderNumber}\n` +
      `Buchtitel:       ${bookTitle}\n` +
      `Kontakt-E-Mail:  ${contactEmail}\n\n` +
      `Kurzbeschreibung (optional):\n${blurb}\n\n` +
      `Wünsche & Erklärungen:\n${notes}\n\n` +
      `Anhänge: ${files.length} Datei(en)\n` +
      `${files.map((f, i) => `  - [${i + 1}] ${f.originalname} (${f.mimetype}, ${f.size} Bytes)`).join("\n")}\n`;

    const attachments = [];
    if (totalBytes(files) > MAX_ATTACH_BYTES) {
      text += `\n⚠️ Hinweis: Anhänge waren größer als ${MAX_ATTACH_BYTES / (1024 * 1024)}MB und wurden nicht als Mail-Anhang versendet.\n`;
    } else {
      files.forEach((f) => {
        attachments.push({
          name: f.originalname || "upload",
          contentBase64: f.buffer.toString("base64"),
        });
      });
    }

    await sendBrevoMail({
      to: RECEIVER_EMAIL,
      subject: "Neues Cover-Briefing vom Kunden",
      text,
      replyTo: contactEmail !== "-" ? contactEmail : undefined,
      attachments,
    });

    res.status(200).json({ ok: true, message: "Cover-Briefing übermittelt." });
  } catch (error) {
    console.error("Fehler bei /cover-order:", error);
    res.status(500).json({ error: "Cover-Briefing konnte nicht gesendet werden." });
  }
});

/** ISBN-Service Formular */
app.post("/isbn-order", upload.none(), async (req, res) => {
  try {

    const {
      name = "-",
      orderNumber = "-",
      bookTitle = "-",
      subtitle = "-",
      authorName = "-",
      language = "-",
      publicationYear = "-",
      contactEmail = "-"
    } = req.body || {};

    const text =
      `Neue ISBN-Anfrage (Kundenbereich)\n\n` +
      `Name: ${name}\n` +
      `Bestellnummer: ${orderNumber}\n` +
      `Buchtitel: ${bookTitle}\n` +
      `Untertitel: ${subtitle}\n` +
      `Autor: ${authorName}\n` +
      `Sprache: ${language}\n` +
      `Erscheinungsjahr: ${publicationYear}\n` +
      `Kontakt-E-Mail: ${contactEmail}\n`;

    await sendBrevoMail({
      to: RECEIVER_EMAIL,
      subject: "Neue ISBN-Anfrage vom Kunden",
      text,
      replyTo: contactEmail !== "-" ? contactEmail : undefined
    });

    res.status(200).json({
      message: "ISBN-Daten erfolgreich übermittelt."
    });

  } catch (error) {
    console.error("Fehler bei /isbn-order:", error);
    res.status(500).json({
      error: "ISBN-Daten konnten nicht gesendet werden."
    });
  }
});

/** Rücksende-Anfrage (application/json) */
app.post("/return-request", async (req, res) => {
  try {
    const {
      name = "-",
      orderNumber = "-",
      quantity = "-",
      address = {},
      contactEmail = "-",
      notes = "",
    } = req.body || {};

    const { name: addrName = "", street = "", zip = "", city = "", country = "" } = address || {};

    const text =
      `Neue Rücksende-Anfrage (Kundenbereich)\n` +
      `Absender:        ${name}\n` +
      `Bestell/Projekt: ${orderNumber}\n` +
      `Anzahl Bücher:   ${quantity}\n` +
      `Kontakt-E-Mail:  ${contactEmail}\n` +
      `Rücksende-Adresse:\n` +
      `  ${addrName}\n  ${street}\n  ${zip} ${city}\n  ${country}\n\n` +
      `Notizen:\n${notes || "(keine)"}\n`;

    await sendBrevoMail({
      to: RECEIVER_EMAIL,
      subject: "Neue Rücksende-Anfrage vom Kunden",
      text,
      replyTo: contactEmail !== "-" ? contactEmail : undefined,
    });

    res.status(200).json({ ok: true, message: "Rücksende-Anfrage übermittelt." });
  } catch (error) {
    console.error("Fehler bei /return-request:", error);
    res.status(500).json({ error: "Rücksende-Anfrage konnte nicht gesendet werden." });
  }
});

/** Projekte aus Shopify Kunden-Metafeldern holen */
app.get("/get-projekte", async (req, res) => {
  try {
    console.log("Starte /get-projekte...");

    const response = await fetch(
"https://7456d9-4.myshopify.com/admin/api/2023-10/customers.json?fields=id,email",
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_TOKEN,
        },
      }
    );

    const data = await response.json();
    if (!response.ok) {
      console.error("Fehler beim Laden der Kunden:", data);
      return res.status(500).json({ error: "Fehler beim Laden der Kunden", details: data });
    }

    const kunden = data.customers || [];
    const projektliste = [];

    for (const kunde of kunden) {
      const metaRes = await fetch(
`https://7456d9-4.myshopify.com/admin/api/2023-10/customers/${kunde.id}/metafields.json`,
        {
          headers: {
            "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_TOKEN,
            "Content-Type": "application/json",
          },
        }
      );

      const metaData = await metaRes.json();
      if (!metaRes.ok) continue;

      const metas = metaData.metafields || [];
      const projekt = metas.find((x) => x.namespace === "dashboard" && x.key === "projekt");
      const buchtitel = metas.find((x) => x.namespace === "dashboard" && x.key === "buchtitel");

      if (projekt && buchtitel) {
        projektliste.push({
          id: kunde.id,
          email: kunde.email,
          projekt: projekt.value,
          buchtitel: buchtitel.value,
        });
      }
    }

    res.json(projektliste);
  } catch (error) {
    console.error("Fehler bei /get-projekte:", error);
    res.status(500).json({ error: "Fehler beim Holen der Projekte", details: error.message });
  }
});

/** Ping */
app.get("/ping", (req, res) => {
  res.status(200).json({ message: "Server wach" });
});

/** Cleanup / Scan / Diag */
app.get("/cleanup", async (req, res) => {
  try {
    const SECRET = process.env.CLEANUP_SECRET;
    if (!SECRET || req.query.secret !== SECRET) return res.status(401).send("Unauthorized");
    const result = await cleanupProducts();
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error("Cleanup error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/cleanup/scan", async (req, res) => {
  try {
    const SECRET = process.env.CLEANUP_SECRET;
    if (!SECRET || req.query.secret !== SECRET) return res.status(401).send("Unauthorized");
    const items = await scanMarked();
    res.json({ ok: true, found: items.length, items });
  } catch (e) {
    console.error("Scan error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/cleanup/diag", async (req, res) => {
  try {
    const SECRET = process.env.CLEANUP_SECRET;
    if (!SECRET || req.query.secret !== SECRET) return res.status(401).send("Unauthorized");

const shop = "7456d9-4.myshopify.com";
    const tokenName = process.env.SHOPIFY_ADMIN_API_TOKEN
      ? "SHOPIFY_ADMIN_API_TOKEN"
      : process.env.SHOPIFY_ADMIN_API_TOKEN_KONFIGURATOR
      ? "SHOPIFY_ADMIN_API_TOKEN_KONFIGURATOR"
      : "NONE";

    const token = process.env.SHOPIFY_ADMIN_API_TOKEN || process.env.SHOPIFY_ADMIN_API_TOKEN_KONFIGURATOR;

    const r = await fetch(`https://${shop}/admin/api/2023-10/products.json?limit=5&status=any`, {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
    });

    const txt = await r.text();
    let j = {};
    try { j = txt ? JSON.parse(txt) : {}; } catch { j = { raw: txt }; }

    if (!r.ok) {
      return res.json({ ok: true, shop, usingTokenEnv: tokenName, apiStatus: `${r.status}`, error: j.errors || j });
    }

    const prods = j.products || [];
    res.json({
      ok: true,
      shop,
      usingTokenEnv: tokenName,
      apiStatus: `${r.status}`,
      sampleCount: prods.length,
      sampleTitles: prods.map((p) => p.title).slice(0, 5),
      error: null,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** Konfigurator: Produkt erstellen */
app.post("/create-product", async (req, res) => {
  try {
    const {
      title,
      price,
      shippingRequired
    } = req.body;

    const result = await createProduct({
      title,
      price,
      shippingRequired: shippingRequired === true
    });

    res.status(200).json({
      message: "✅ Produkt erfolgreich erstellt",
      produktId: result.legacyVariantId,
      productId: result.productId,
      variantId: result.variantId,
      legacyVariantId: result.legacyVariantId,
    });

  } catch (error) {
    console.error(
      "❌ Fehler beim Erstellen des Produkts:",
      error?.message || error
    );

    res.status(500).json({
      error: "Produkt konnte nicht erstellt werden"
    });
  }
});

/** Kontaktformular (Brevo API) + erweiterter Spam-Schutz + Datei-Upload */

// Einfaches Rate-Limit nur für das Kontaktformular.
// Speicherung im RAM – beeinflusst keine anderen Serverfunktionen.
const kontaktRateLimit = new Map();

function kontaktGetIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();

  return forwarded || req.ip || "unknown";
}

function kontaktIsRateLimited(req) {
  const ip = kontaktGetIp(req);
  const now = Date.now();

  // 15 Minuten
  const windowMs = 15 * 60 * 1000;

  // Maximal 5 Versuche innerhalb dieses Zeitraums
  const maxRequests = 5;

  const previous = kontaktRateLimit.get(ip) || [];

  const recent = previous.filter(
    timestamp => now - timestamp < windowMs
  );

  recent.push(now);
  kontaktRateLimit.set(ip, recent);

  return recent.length > maxRequests;
}


/**
 * Spam-Punktesystem.
 *
 * Wichtig:
 * Ein einzelnes Wort wie "WhatsApp", "Marketing"
 * oder "Bestellungen" blockiert NICHT automatisch.
 *
 * Erst mehrere typische Merkmale zusammen ergeben
 * genügend Punkte für eine Blockierung.
 */
function kontaktSpamScore({
  contact_name,
  contact_email,
  contact_subject,
  contact_message
}) {

  const text = [
    contact_name,
    contact_email,
    contact_subject,
    contact_message
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let score = 0;
  const reasons = [];


  function add(points, reason) {
    score += points;
    reasons.push(reason);
  }


  // Typische Marketing-/Akquise-Angebote
  if (
    /\b(marketing|marketer|marketingstrategie|marketing strategy|e-?commerce marketing|youtube marketing|tiktok marketing)\b/i.test(text)
  ) {
    add(2, "Marketing-Angebot");
  }


  // Versprechen, Bestellungen / Verkäufe zu generieren
  if (
    /\b(generate|generieren|bringen|bring|drive|deliver)\b.{0,60}\b(orders?|bestellungen|sales|verkäufe|kunden)\b/i.test(text) ||
    /\b(orders?|bestellungen|sales|verkäufe)\b.{0,60}\b(generate|generieren|bringen|bring|drive|deliver)\b/i.test(text)
  ) {
    add(3, "Verkaufs-/Bestellversprechen");
  }


  // Typische Zahlenversprechen:
  // "30-50 orders", "40 Bestellungen", "200 sales" usw.
  if (
    /\b\d{2,4}\s*(?:-|–|—|bis|to)?\s*\d{0,4}\s*(orders?|bestellungen|sales|verkäufe)\b/i.test(text)
  ) {
    add(3, "Zahlenversprechen");
  }


  // Testlauf / Trial-Angebote
  if (
    /\b(testlauf|test run|trial|probephase|pilotprojekt|pilot project)\b/i.test(text)
  ) {
    add(2, "Testlauf-Angebot");
  }


  // Zusammenarbeit / Kooperation in Akquise-Kontext
  if (
    /\b(zusammenarbeit|kooperation|collaboration|partnership|partner with|work together)\b/i.test(text)
  ) {
    add(1, "Kooperationsangebot");
  }


  // WhatsApp / Telegram allein reicht ausdrücklich NICHT zum Blockieren
  if (
    /\b(whatsapp|telegram)\b/i.test(text)
  ) {
    add(1, "Messenger erwähnt");
  }


  // Typische Formulierungen aus automatisierter Shop-Akquise
  if (
    /\b(increase|boost|scale|grow|steigern|erhöhen)\b.{0,50}\b(sales|orders?|umsatz|verkäufe|bestellungen)\b/i.test(text)
  ) {
    add(2, "Wachstumsversprechen");
  }


  // Viele URLs sind bei einer normalen Kontaktanfrage ungewöhnlich.
  const urls =
    text.match(/https?:\/\/|www\./gi) || [];

  if (urls.length >= 2) {
    add(2, "Mehrere Links");
  }

  if (urls.length >= 4) {
    add(2, "Sehr viele Links");
  }


  return {
    score,
    reasons
  };
}


/**
 * HTML escapen, damit Inhalte aus dem öffentlichen
 * Formular nicht ungefiltert in der HTML-Mail landen.
 */
function kontaktEscapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/**
 * Kontaktformular
 *
 * Eine optionale Datei:
 * PDF / JPG / PNG
 * maximal 5 MB
 */
app.post(
  "/kontakt",

  upload.single("contact_file"),

  async (req, res) => {

    try {

      const {
        contact_type,
        contact_name,
        contact_email,
        contact_subject,
        contact_message
      } = req.body || {};


      /**********************************************
       * 1. Honeypot
       **********************************************/

      if (
        req.body?.website &&
        String(req.body.website).trim() !== ""
      ) {

        console.log(
          "🛑 Kontakt-Spam geblockt: Honeypot"
        );

        // Absichtlich Erfolg vortäuschen.
        return res.status(200).json({
          message: "Nachricht erfolgreich versendet."
        });

      }


      /**********************************************
       * 2. Zeitcheck
       *
       * Unter 5 Sekunden ist für dieses Formular
       * sehr verdächtig.
       **********************************************/

      const formTime =
        Number(req.body?.formTime || 0);

      const seconds =
        formTime
          ? (Date.now() - formTime) / 1000
          : 0;


      if (
        !formTime ||
        seconds < 5
      ) {

        console.log(
          "🛑 Kontakt-Spam geblockt: zu schnell",
          seconds
        );

        return res.status(200).json({
          message: "Nachricht erfolgreich versendet."
        });

      }


      /**********************************************
       * 3. Rate Limit
       **********************************************/

      if (
        kontaktIsRateLimited(req)
      ) {

        console.log(
          "🛑 Kontakt-Spam geblockt: Rate Limit",
          kontaktGetIp(req)
        );

        return res.status(200).json({
          message: "Nachricht erfolgreich versendet."
        });

      }


      /**********************************************
       * 4. Grundlegende serverseitige Validierung
       **********************************************/

      const type =
        String(contact_type || "").trim();

      const name =
        String(contact_name || "").trim();

      const email =
        String(contact_email || "").trim();

      const subject =
        String(contact_subject || "").trim();

      const message =
        String(contact_message || "").trim();


      if (
        !type ||
        name.length < 2 ||
        subject.length < 3 ||
        message.length < 10
      ) {

        return res.status(400).json({
          error: "Bitte fülle alle Pflichtfelder vollständig aus."
        });

      }


      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ) {

        return res.status(400).json({
          error: "Bitte gib eine gültige E-Mail-Adresse ein."
        });

      }


      // Gleiche Maximalwerte wie im Frontend.
      if (
        name.length > 100 ||
        email.length > 160 ||
        subject.length > 150 ||
        message.length > 5000
      ) {

        return res.status(400).json({
          error: "Eine oder mehrere Eingaben sind zu lang."
        });

      }


      /**********************************************
       * 5. Spam-Punktesystem
       **********************************************/

      const spam =
        kontaktSpamScore({
          contact_name: name,
          contact_email: email,
          contact_subject: subject,
          contact_message: message
        });


      /*
       * Ab 5 Punkten wird still geblockt.
       *
       * Beispiele:
       *
       * Marketing + 30–50 Bestellungen
       * = deutlich über dem Grenzwert
       *
       * Kunde erwähnt nur "WhatsApp"
       * = weit unter dem Grenzwert
       */

      if (
        spam.score >= 5
      ) {

        console.log(
          "🛑 Kontakt-Spam geblockt:",
          {
            score: spam.score,
            reasons: spam.reasons
          }
        );

        return res.status(200).json({
          message: "Nachricht erfolgreich versendet."
        });

      }


      /**********************************************
       * 6. Optionaler Datei-Upload
       **********************************************/

      const file =
        req.file;


      const attachments = [];


      if (file) {

        const allowedTypes = [
          "application/pdf",
          "image/jpeg",
          "image/png"
        ];


        if (
          !allowedTypes.includes(file.mimetype)
        ) {

          return res.status(400).json({
            error: "Bitte lade nur PDF-, JPG- oder PNG-Dateien hoch."
          });

        }


        const maxFileBytes =
          5 * 1024 * 1024;


        if (
          file.size > maxFileBytes
        ) {

          return res.status(400).json({
            error: "Die Datei darf maximal 5 MB groß sein."
          });

        }


        attachments.push({
          name:
            file.originalname ||
            "Kontakt-Anhang",

          contentBase64:
            file.buffer.toString("base64")
        });

      }


      /**********************************************
       * 7. Mail erstellen
       **********************************************/

      const html = `
        <h3>Neue Kontaktanfrage</h3>

        <p>
          <b>Ich bin:</b>
          ${kontaktEscapeHtml(type)}
        </p>

        <p>
          <b>Name:</b>
          ${kontaktEscapeHtml(name)}
        </p>

        <p>
          <b>E-Mail:</b>
          ${kontaktEscapeHtml(email)}
        </p>

        <p>
          <b>Betreff:</b>
          ${kontaktEscapeHtml(subject)}
        </p>

        <p>
          <b>Nachricht:</b><br>
          ${kontaktEscapeHtml(message).replace(/\n/g, "<br>")}
        </p>

        ${
          file
            ? `<p><b>Anhang:</b> ${kontaktEscapeHtml(file.originalname)}</p>`
            : ""
        }
      `;


      /**********************************************
       * 8. Über bestehenden Brevo-Helper senden
       **********************************************/

      await sendBrevoMail({

        to:
          CONTACT_RECEIVER_EMAIL,

        subject:
          `Kontaktanfrage: ${subject}`,

        html,

        replyTo:
          email,

        attachments

      });


      res.status(200).json({
        message:
          "Nachricht erfolgreich versendet."
      });


    } catch (error) {

      console.error(
        "Fehler bei /kontakt:",
        error
      );


      res.status(500).json({
        error:
          "Nachricht konnte nicht gesendet werden."
      });

    }

  }
);

/** Start */
const server = app.listen(port, () => {
  console.log(`Server läuft auf Port ${port}`);
});

module.exports = server;
