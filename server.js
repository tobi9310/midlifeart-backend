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

// Druckdaten-Upload
app.post('/upload', upload.fields([
  { name: 'buchcover', maxCount: 1 },
  { name: 'buchinhalt', maxCount: 1 }
]), async (req, res) => {
  try {
    const formData = req.body;
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

    const emailText = `Neuer Druckdaten-Upload\n\nBuchtitel: ${formData.buchTitel}\n\nEs wurden 2 PDF-Dateien hochgeladen:\n- ${files.buchcover?.[0]?.originalname}\n- ${files.buchinhalt?.[0]?.originalname}`;

    const mailOptions = {
      from: process.env.SENDER_EMAIL,
      to: process.env.RECEIVER_EMAIL,
      subject: 'Neuer Druckdaten-Upload vom Kunden',
      text: emailText,
      attachments: [
        {
          filename: files.buchcover?.[0]?.originalname || 'buchcover.pdf',
          content: files.buchcover?.[0]?.buffer
        },
        {
          filename: files.buchinhalt?.[0]?.originalname || 'buchinhalt.pdf',
          content: files.buchinhalt?.[0]?.buffer
        }
      ]
    };

    await transporter.sendMail(mailOptions);
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

    const response = await createProduct({
      title,
      price,
      description,
      token: process.env.SHOPIFY_ADMIN_API_TOKEN_KONFIGURATOR,
    });

    res.status(200).json({ message: 'Produkt erfolgreich erstellt', produktId: response?.product?.id });
  } catch (error) {
    console.error('Fehler beim Erstellen des Produkts:', error);
    res.status(500).json({ error: 'Produkt konnte nicht erstellt werden' });
  }
});


// Server starten
const server = app.listen(port, () => {
  console.log(`Server läuft auf Port ${port}`);
});

module.exports = server;
