const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const cors = require('cors');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

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
    const labels = {
      kontoinhaber: "Kontoinhaber",
      bank: "Bank",
      iban: "IBAN"
    };

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

app.post("/save-buchtitel", express.json(), async (req, res) => {
  try {
    const { customerId, buchtitel } = req.body;

const response = await fetch(`https://www.midlifeart.de/admin/api/2023-10/customers/${customerId}/metafields.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_TOKEN,
      },
      body: JSON.stringify({
        metafield: {
          namespace: "dashboard",
          key: "buchtitel",
          value: buchtitel,
          type: "single_line_text_field"
        }
      }),
    });

    const result = await response.json();

    if (response.ok) {
      res.status(200).json({ message: "Buchtitel gespeichert!" });
    } else {
      console.error("Shopify-Fehler:", result);
      res.status(500).json({ error: "Fehler beim Speichern." });
    }
  } catch (error) {
    console.error("Serverfehler:", error);
    res.status(500).json({ error: "Interner Serverfehler" });
  }
});

app.get("/get-projekte", async (req, res) => {
  try {
const response = await fetch("https://midlifeart.myshopify.com/admin/api/2023-10/customers.json?fields=id,email,metafields", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_TOKEN
      }
    });

    const data = await response.json();
    if (!data.customers) {
      return res.status(500).json({ error: "Keine Kunden gefunden." });
    }

    const projektliste = [];

    for (const kunde of data.customers) {
const metaRes = await fetch(`https://midlifeart.myshopify.com/admin/api/2023-10/customers/${kunde.id}/metafields.json`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_API_TOKEN
        }
      });

      const metaData = await metaRes.json();
      const metas = metaData.metafields;

      const projekt = metas.find(x => x.namespace === "dashboard" && x.key === "projekt");
      const buchtitel = metas.find(x => x.namespace === "dashboard" && x.key === "buchtitel");

      if (projekt && buchtitel) {
        projektliste.push({
          id: kunde.id,
          email: kunde.email,
          projekt: projekt.value,
          buchtitel: buchtitel.value
        });
      }
    }

    res.status(200).json({ projekte: projektliste });
  } catch (error) {
    console.error("Fehler beim Abrufen der Projekte:", error);
    res.status(500).json({ error: "Fehler beim Abrufen der Projekte." });
  }
});

const server = app.listen(port, () => {
  console.log(`Server läuft auf Port ${port}`);
});

module.exports = server;
