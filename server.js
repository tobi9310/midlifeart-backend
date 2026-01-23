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

      let text = "Neuer Druckdaten-Upload (Kundenbereich):\n\n";
      text += `Druckart/Inklusivleistungen: ${data.inklusivleistungen || data.druckart || "-"}\n`;
      text += `Bestellnummer: ${data.bestellnummer || "-"}\n`;
      text += `Buchtitel: ${data.buchtitel || "-"}\n`;
      text += `Verkaufspreis: ${data.verkaufspreis || "-"}\n`;
      text += `Genre: ${data.genre || "-"}\n`;
      text += `Buchbeschreibung: ${data.inhaltsangabe || "-"}\n`;
      text += `Autor:innenname: ${data.autorname || "-"}\n`;
      text += `Autoreninfo: ${data.autoreninfo || "-"}\n`;
      text += `Kontakt-E-Mail: ${data.contactEmail || "-"}\n`;

      const att = [];
      const cover = files.cover?.[0];
      const inhalt = files.inhalt?.[0];
      const autorenbild = files.autorenbild?.[0];

      // Sammle File-Infos
      text += `\n--- Dateien ---\n`;
      text += `Buchcover: ${cover?.originalname || "-"}\n`;
      text += `Buchinhalt: ${inhalt?.originalname || "-"}\n`;
      text += `Autorenbild: ${autorenbild?.originalname || "-"}\n`;

      // Attachments (Base64)
      const fileList = [cover, inhalt, autorenbild].filter(Boolean);
      if (totalBytes(fileList) > MAX_ATTACH_BYTES) {
        text += `\n⚠️ Hinweis: Anhänge waren größer als ${MAX_ATTACH_BYTES / (1024 * 1024)}MB und wurden nicht als Mail-Anhang versendet.\n`;
      } else {
        if (cover) att.push({ name: cover.originalname, contentBase64: cover.buffer.toString("base64") });
        if (inhalt) att.push({ name: inhalt.originalname, contentBase64: inhalt.buffer.toString("base64") });
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
      `${files
        .map((f, i) => `  - [${i + 1}] ${f.originalname} (${f.mimetype}, ${f.size} Bytes)`)
        .join("\n")}\n`;

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

/** Cleanup / Scan / Diag (unverändert) */
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
    const { title, price } = req.body;
    const result = await createProduct({ title, price });

    res.status(200).json({
      message: "✅ Produkt erfolgreich erstellt",
      produktId: result.legacyVariantId,
      productId: result.productId,
      variantId: result.variantId,
      legacyVariantId: result.legacyVariantId,
    });
  } catch (error) {
    console.error("❌ Fehler beim Erstellen des Produkts:", error?.message || error);
    res.status(500).json({ error: "Produkt konnte nicht erstellt werden" });
  }
});

/** Kontaktformular (Brevo API) */
app.post("/kontakt", upload.none(), async (req, res) => {
  try {
    const { contact_type, contact_name, contact_email, contact_subject, contact_message } = req.body || {};

    const html = `
      <h3>Neue Kontaktanfrage</h3>
      <p><b>Ich bin:</b> ${contact_type || "-"}</p>
      <p><b>Name:</b> ${contact_name || "-"}</p>
      <p><b>E-Mail:</b> ${contact_email || "-"}</p>
      <p><b>Betreff:</b> ${contact_subject || "-"}</p>
      <p><b>Nachricht:</b><br>${(contact_message || "-").replace(/\n/g, "<br>")}</p>
    `;

    await sendBrevoMail({
      to: CONTACT_RECEIVER_EMAIL,
      subject: `Kontaktanfrage: ${contact_subject || "(ohne Betreff)"}`,
      html,
      replyTo: contact_email || undefined,
    });

    res.status(200).json({ message: "Nachricht erfolgreich versendet." });
  } catch (error) {
    console.error("Fehler bei /kontakt:", error);
    res.status(500).json({ error: "Nachricht konnte nicht gesendet werden." });
  }
});

/** Start */
const server = app.listen(port, () => {
  console.log(`Server läuft auf Port ${port}`);
});

module.exports = server;
