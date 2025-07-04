const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const fetch = require('node-fetch');
const cors = require('cors');
const multer = require('multer');
const { createProduct } = require('./konfigurator/create-product');
const app = express();
const port = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage() });
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Auszahlungskonto-Formular
app.post('/submit', upload.none(), async (req, res) => {
  try {
    const formData = req.body;
    const transporter = nodemailer.createTransport({
host: 'smtp.strato.de',
      port: 465,
      secure: true,
      auth: {
        user: process.env.SENDER_EMAIL,
        pass: process.env.SMTP_PASSWORD,
      },
    });
    let text = 'Neue Auszahlungskonto Übermittlung:\n\n';
    const labels = { kontoinhaber: "Kontoinhaber", bank: "Bank", iban: "IBAN" };
    for (let key in formData) {
      const label = labels[key] || key;
      text += `${label}: ${formData[key]}\n`;
    }
    await transporter.sendMail({
      from: process.env.SENDER_EMAIL,
      to: process.env.RECEIVER_EMAIL,
      subject: 'Neue Bankdaten vom Kunden',
      text: text,
    });
    res.status(200).json({ message: 'E-Mail erfolgreich gesendet.' });
  } catch (error) {
    console.error('Fehler beim E-Mail-Versand:', error);
    res.status(500).json({ error: 'Fehler beim E-Mail-Versand.' });
  }
});

// === NEUER /upload-Endpunkt für ALLE FELDER & DATEIEN ===
app.post('/upload', upload.fields([
  { name: 'cover', maxCount: 1 },
  { name: 'inhalt', maxCount: 1 },
  { name: 'autorenbild', maxCount: 1 }
]), async (req, res) => {
  try {
    const data = req.body;
    const files = req.files;
    const transporter = nodemailer.createTransport({
host: 'smtp.strato.de',
      port: 465,
      secure: true,
      auth: {
        user: process.env.SENDER_EMAIL,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    let text = 'Neuer Druckdaten-Upload (Kundenbereich):\n\n';
    text += `Inklusivleistungen: ${data.inklusivleistungen || '-'}\n`;
    text += `Bestellnummer: ${data.bestellnummer || '-'}\n`;
    text += `Buchtitel: ${data.buchtitel || '-'}\n`;
    text += `Verkaufspreis: ${data.verkaufspreis || '-'}\n`;
    text += `Genre: ${data.genre || '-'}\n`;
    text += `Buchbeschreibung: ${data.inhaltsangabe || '-'}\n`;
    text += `Autoreninfo: ${data.autoreninfo || '-'}\n`;

    text += `\n--- Dateien ---\n`;
    text += `Buchcover: ${files.cover?.[0]?.originalname || '-'}\n`;
    text += `Buchinhalt: ${files.inhalt?.[0]?.originalname || '-'}\n`;
    if (files.autorenbild?.[0]) {
      text += `Autorenbild: ${files.autorenbild[0].originalname}\n`;
    }

    const attachments = [];
    if (files.cover?.[0]) attachments.push({
      filename: files.cover[0].originalname,
      content: files.cover[0].buffer
    });
    if (files.inhalt?.[0]) attachments.push({
      filename: files.inhalt[0].originalname,
      content: files.inhalt[0].buffer
    });
    if (files.autorenbild?.[0]) attachments.push({
      filename: files.autorenbild[0].originalname,
      content: files.autorenbild[0].buffer
    });

    await transporter.sendMail({
      from: process.env.SENDER_EMAIL,
      to: process.env.RECEIVER_EMAIL,
      subject: 'Neuer Druckdaten-Upload vom Kunden (alle Felder)',
      text,
      attachments
    });

    res.status(200).json({ message: 'Upload erfolgreich übermittelt.' });
  } catch (error) {
    console.error('Fehler beim Upload-Versand:', error);
    res.status(500).json({ error: 'Upload fehlgeschlagen.' });
  }
});

// Buchinserat-Formular
app.post('/inserat', upload.single('autorenbild'), async (req, res) => {
  try {
    const formData = req.body;
    const datei = req.file;
    const transporter = nodemailer.createTransport({
host: 'smtp.strato.de',
      port: 465,
      secure: true,
      auth: {
        user: process.env.SENDER_EMAIL,
        pass: process.env.SMTP_PASSWORD,
      },
    });
    const labels = {
      buchtitel: "Buchtitel",
      inhaltsangabe: "Inhaltsangabe",
      autorenname: "Autorenname",
      autorenbeschreibung: "Autorenbeschreibung",
      verkaufspreis: "Verkaufspreis"
    };
    let text = "Neues Buchinserat vom Kunden:\n\n";
    for (let key in formData) {
      const label = labels[key] || key;
      text += `${label}: ${formData[key]}\n\n`;
    }
    const mailOptions = {
      from: process.env.SENDER_EMAIL,
      to: process.env.RECEIVER_EMAIL,
      subject: "Neues Buchinserat eingegangen",
      text: text,
      attachments: datei ? [{
        filename: datei.originalname || 'autorenbild.jpg',
        content: datei.buffer
      }] : []
    };
    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: 'Inserat erfolgreich gesendet.' });
  } catch (error) {
    console.error('Fehler beim Inserat-Versand:', error);
    res.status(500).json({ error: 'Fehler beim Inserat-Versand.' });
  }
});
app.get("/get-projekte", async (req, res) => {
  try {
    console.log("Starte /get-projekte...");
const response = await fetch("https://7456d9-4.myshopify.com/admin/api/2023-10/customers.json?fields=id,email", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_TOKEN,
      }
    });
    const data = await response.json();
    if (!response.ok) {
      console.error("Fehler beim Laden der Kunden:", data);
      return res.status(500).json({ error: "Fehler beim Laden der Kunden", details: data });
    }
    const kunden = data.customers || [];
    console.log(`Anzahl Kunden: ${kunden.length}`);
    const projektliste = [];
    for (const kunde of kunden) {
      console.log(`Bearbeite Kunde ${kunde.id} (${kunde.email})`);
const metaRes = await fetch(`https://7456d9-4.myshopify.com/admin/api/2023-10/customers/${kunde.id}/metafields.json`, {
        headers: {
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_TOKEN,
          "Content-Type": "application/json"
        }
      });
      const metaData = await metaRes.json();
      if (!metaRes.ok) {
        console.error(`Fehler beim Laden der Metafelder von Kunde ${kunde.id}:`, metaData);
        continue;
      }
      const metas = metaData.metafields || [];
      console.log(`→ Metafelder gefunden (${metas.length}):`, metas.map(x => `${x.namespace}.${x.key} = ${x.value}`));
      const projekt = metas.find(x => x.namespace === "dashboard" && x.key === "projekt");
      const buchtitel = metas.find(x => x.namespace === "dashboard" && x.key === "buchtitel");
      if (projekt && buchtitel) {
        projektliste.push({
          id: kunde.id,
          email: kunde.email,
          projekt: projekt.value,
          buchtitel: buchtitel.value
        });
      } else {
        console.warn(`→ ⚠️ Projekt oder Buchtitel fehlt bei Kunde ${kunde.id}`);
      }
    }
    console.log("FERTIG – Projektliste:", projektliste);
    res.json(projektliste);
  } catch (error) {
    console.error("Fehler beim Holen der Projekte:", error);
    res.status(500).json({ error: "Fehler beim Holen der Projekte", details: error.message });
  }
});
app.get("/ping", (req, res) => {
  res.status(200).json({ message: "Server wach" });
});
app.post('/create-product', async (req, res) => {
  try {
    const { title, price, description } = req.body;
    // Debug: Zeige alle übergebenen Werte an
    console.log("Anfrage an createProduct:", title, price, description);
    // Shopify API-Aufruf
const response = await fetch('https://7456d9-4.myshopify.com/admin/api/2023-10/products.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_API_TOKEN_KONFIGURATOR
      },
      body: JSON.stringify({
        product: {
          title,
          body_html: description,
          variants: [
            {
              price: price
            }
          ]
        }
      })
    });
    const data = await response.json();
    // Debug: Wenn kein Produkt zurückkommt
    if (!data.product) {
      console.error("❌ Kein Produkt erhalten:", data);
      return res.status(500).json({ error: "Produkt konnte nicht erstellt werden" });
    }
    // Erfolg
    const variantId = data.product.variants[0].id;
    return res.status(200).json({
      message: '✅ Produkt erfolgreich erstellt',
      produktId: variantId
    });

  } catch (error) {
    console.error('❌ Fehler beim Erstellen des Produkts:', error?.response?.errors || error);
    res.status(500).json({ error: 'Produkt konnte nicht erstellt werden' });
  }
});
// Kontaktformular
app.post('/kontakt', upload.none(), async (req, res) => {
  try {
    const { contact_type, contact_name, contact_email, contact_subject, contact_message } = req.body;
    const transporter = nodemailer.createTransport({
host: 'smtp.strato.de',
      port: 465,
      secure: true,
      auth: {
        user: process.env.SENDER_EMAIL,
        pass: process.env.SMTP_PASSWORD,
      },
    });
    const text = `Neue Kontaktanfrage:\n\n` +
                 `Ich bin: ${contact_type}\n` +
                 `Name: ${contact_name}\n` +
                 `E-Mail: ${contact_email}\n` +
                 `Betreff: ${contact_subject}\n\n` +
                 `Nachricht:\n${contact_message}`;
    await transporter.sendMail({
      from: process.env.SENDER_EMAIL,
to: "info@midlifeart.de",
      subject: 'Neue Kontaktanfrage über das Formular',
      text: text,
    });
    res.status(200).json({ message: 'Nachricht erfolgreich versendet.' });
  } catch (error) {
    console.error('Fehler beim Versenden des Kontaktformulars:', error);
    res.status(500).json({ error: 'Nachricht konnte nicht gesendet werden.' });
  }
});

// Server starten
const server = app.listen(port, () => {
  console.log(`Server läuft auf Port ${port}`);
});
module.exports = server;
