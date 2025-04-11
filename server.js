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

async function submitInseratForm(event) {
  event.preventDefault();
  const form = document.getElementById("form-inserat1");
  const formData = new FormData(form);

  try {
    const response = await fetch("https://midlifeart-backend-1.onrender.com/inserat", {
      method: "POST",
      body: formData
    });

    const result = await response.json();

    if (response.ok) {
      zeigeHinweis("Dein Buchinserat wurde erfolgreich übermittelt.");
      form.reset();
    } else {
      zeigeHinweis("Fehler beim Senden: " + result.error, "#f8d7da");
    }
  } catch (error) {
    zeigeHinweis("Fehler beim Senden: " + error.message, "#f8d7da");
  }
}


    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: 'Inserat erfolgreich übermittelt.' });
  } catch (error) {
    console.error('Fehler beim Buchinserat:', error);
    res.status(500).json({ error: 'Inserat fehlgeschlagen.' });
  }
});



const server = app.listen(port, () => {
  console.log(`Server läuft auf Port ${port}`);
});

module.exports = server;
