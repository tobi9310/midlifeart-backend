const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.post('/submit', async (req, res) => {
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
    let text = 'Neue Auszahlungskonto-Übermittlung:\n\n';
    for (let key in formData) {
      text += `${key}: ${formData[key]}\n`;
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

app.get('/', (req, res) => {
  res.send('Backend läuft!');
});

app.listen(port, () => {
  console.log(`Server läuft auf Port ${port}`);
});
