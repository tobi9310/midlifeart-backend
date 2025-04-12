const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const app = express();
const port = process.env.PORT || 3000;
const cors = require('cors');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });


app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.post('/submit', upload.none(), async (req, res) => {
  try {
    const formData = req.body;

    // Transporter für STRATO SMTP
    const transporter = nodemailer.createTransport({
      host: 'smtp.strato.de',
      port: 465,
      secure: true,
      auth: {
        user: process.env.SENDER_EMAIL,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    // E-Mail-Inhalt vorbereiten
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


    // E-Mail absenden
    const info = await transporter.sendMail({
      from: process.env.SENDER_EMAIL,
      to: process.env.RECEIVER_EMAIL,
      subject: 'Neue Bankdaten vom Kunden',
      text: text,
    });

    console.log('E-Mail gesendet:', info.response);
    res.status(200).json({ message: 'E-Mail erfolgreich gesendet.' });
  } catch (error) {
    console.error('Fehler beim E-Mail-Versand:', error);
    res.status(500).json({ error: 'Fehler beim E-Mail-Versand.' });
  }
});

app.post('/upload', upload.fields([
  { name: 'buchcover', maxCount: 1 },
  { name: 'buchinhalt', maxCount: 1 }
]),         async (req, res) => {
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
    const datei = req.file; // Autorenbild

    const transporter = nodemailer.createTransport({
      host: 'smtp.strato.de',
      port: 465,
      secure: true,
      auth: {
        user: process.env.SENDER_EMAIL,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    // Labels für schönere Ausgabe
    const labels = {
      buchtitel: "Buchtitel",
      inhaltsangabe: "Inhaltsangabe",
      autorenname: "Autorenname",
      autorenbeschreibung: "Autorenbeschreibung",
      verkaufspreis: "Verkaufspreis"
    };

    // Nachrichtentext zusammensetzen
    let text = "Neues Buchinserat vom Kunden:\n\n";
    for (let key in formData) {
      const label = labels[key] || key;
      text += `${label}: ${formData[key]}\n\n`;
    }

    // E-Mail-Optionen
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

const server = app.listen(port, () => {
  console.log(`Server läuft auf Port ${port}`);
});

module.exports = server;
