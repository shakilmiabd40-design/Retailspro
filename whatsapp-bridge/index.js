import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import express from 'express';
import qrcode from 'qrcode-terminal';

const app = express();
app.use(express.json());

let sock = null;

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('SCAN THIS QR CODE:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) connectToWhatsApp();
    } else if (connection === 'open') {
      console.log('WhatsApp connection opened!');
    }
  });
}

app.post('/send', async (req, res) => {
  if (!sock) return res.status(503).send('Socket not initialized');
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).send('Missing phone or message');

  try {
    const jid = `${phone.replace(/\D/g, '')}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text: message });
    res.send({ status: 'success' });
  } catch (err) {
    res.status(500).send({ error: String(err) });
  }
});

connectToWhatsApp();
app.listen(3002, () => console.log('WhatsApp Bridge running on http://localhost:3002'));
