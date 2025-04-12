const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const multer = require('multer');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Auszahlungskonto
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

// Druckdaten-Upload (Cover & Inhalt)
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

    const emailText = `Neuer Druckdaten-Upload

Buchtitel: ${formData.buchTitel}

Dateien:
- ${files.buchcover?.[0]?.originalname}
- ${files.buchinhalt?.[0]?.originalname}`;

    const mailOptions = {
      from: process.env.SENDER_EMAIL,
      to: process.env.RECEIVER_EMAIL,
      subject: 'Neuer Druckdaten-Upload vom Kunden',
      text: emailText,
      attachments: [
        { filename: files.buchcover?.[0]?.originalname || 'buchcover.pdf', content: files.buchcover?.[0]?.buffer },
        { filename: files.buchinhalt?.[0]?.originalname || 'buchinhalt.pdf', content: files.buchinhalt?.[0]?.buffer }
      ]
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: 'Upload erfolgreich übermittelt.' });
  } catch (error) {
    console.error('Fehler beim Upload-Versand:', error);
    res.status(500).json({ error: 'Upload fehlgeschlagen.' });
  }
});

// Buchinserat
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

    let text = "Neues Buchinserat vom Kunden:

";
    for (let key in formData) {
      const label = labels[key] || key;
      text += `${label}: ${formData[key]}

`;
    }

    const mailOptions = {
      from: process.env.SENDER_EMAIL,
      to: process.env.RECEIVER_EMAIL,
      subject: "Neues Buchinserat eingegangen",
      text: text,
      attachments: datei ? [{ filename: datei.originalname || 'autorenbild.jpg', content: datei.buffer }] : []
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: 'Inserat erfolgreich gesendet.' });
  } catch (error) {
    console.error('Fehler beim Inserat-Versand:', error);
    res.status(500).json({ error: 'Fehler beim Inserat-Versand.' });
  }
});

const server = app.listen(port, () => {
  console.log(`Server läuft auf Port ${port}`);
});

module.exports = server;
