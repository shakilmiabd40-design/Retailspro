import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import express from 'express';
import qrcode from 'qrcode';

const app = express();
app.use(express.json());

let sock = null;
let latestQR = null;

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('QR Code received. View at /qr');
      latestQR = qr;
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      console.log('Connection closed. Status:', statusCode);
      latestQR = null;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log('Reconnecting...');
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      latestQR = null;
      console.log('WhatsApp connection opened successfully!');
    }
  });
}

app.get('/qr', async (req, res) => {
  if (!latestQR) return res.send('<html><body><h3>QR not ready or already connected. Please wait or restart service.</h3></body></html>');
  try {
    const url = await qrcode.toDataURL(latestQR);
    res.send(`<html><body style="text-align:center;font-family:sans-serif;margin-top:50px;"><h2>Scan QR Code with WhatsApp</h2><img src="${url}" /><p>Open WhatsApp on your phone -> Linked Devices -> Link a Device</p></body></html>`);
  } catch (err) {
    res.status(500).send(String(err));
  }
});

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
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`WhatsApp Bridge running on port ${PORT}`));
