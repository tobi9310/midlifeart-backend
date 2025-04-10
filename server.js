const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const app = express();
const port = process.env.PORT || 3000;
const cors = require('cors');
const multer = require('multer');
const upload = multer(); // Keine Dateien, nur Textfelder

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

const server = app.listen(port, () => {
  console.log(`Server läuft auf Port ${port}`);
});

module.exports = server;
