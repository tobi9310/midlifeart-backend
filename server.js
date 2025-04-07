const express = require('express');
const bodyParser = require('body-parser');
const sgMail = require('@sendgrid/mail');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' }); // Speichert Uploads temporär

const app = express();
const port = process.env.PORT || 3000;

// Setze SendGrid API Key aus einer Umgebungsvariable
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Parsen von JSON und URL-kodierten Daten
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Endpoint zum Empfangen von Formular-Daten (inkl. Datei-Uploads)
app.post('/submit', upload.any(), async (req, res) => {
  try {
    const formData = req.body;
    const files = req.files; // Array mit hochgeladenen Dateien

    // E-Mail-Text zusammenbauen
    let emailText = 'Neue Formularübermittlung:\n\n';
    for (let key in formData) {
      emailText += `${key}: ${formData[key]}\n`;
    }

    if (files && files.length > 0) {
      emailText += '\nDateien:\n';
      files.forEach(file => {
        emailText += `${file.originalname} (temporär gespeichert: ${file.path})\n`;
      });
    }

    // E-Mail-Nachricht definieren – Absender, Empfänger und Betreff aus Umgebungsvariablen
    const msg = {
      to: process.env.RECEIVER_EMAIL, // Empfängeradresse (deine E-Mail)
      from: process.env.SENDER_EMAIL,   // Absenderadresse (muss in SendGrid verifiziert sein)
      subject: 'Neue Formularübermittlung',
      text: emailText,
    };

    // Sende die E-Mail
    await sgMail.send(msg);

    res.status(200).json({ message: 'Formular erfolgreich gesendet!' });
  } catch (error) {
    console.error('Fehler beim Senden der E-Mail:', error);
    res.status(500).json({ error: 'Ein Fehler ist aufgetreten.' });
  }
});

// Einfacher Root-Endpoint zum Testen
app.get('/', (req, res) => {
  res.send('Backend läuft!');
});

app.listen(port, () => {
  console.log(`Server läuft auf Port ${port}`);
});
