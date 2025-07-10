import { IncomingForm } from 'formidable';
import { put } from '@vercel/blob';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm();
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { fields, files } = await parseForm(req);
    const { orderId } = fields;
    let cardImage = files.cardImage;
    console.log('Formidable files:', files);
    console.log('cardImage:', cardImage);

    if (Array.isArray(cardImage)) {
      cardImage = cardImage[0];
    }
    if (!orderId) {
      return res.status(400).json({ error: 'No orderId provided' });
    }
    if (!cardImage) {
      return res.status(400).json({ error: 'No card image provided' });
    }
    const filePath = cardImage.filepath || cardImage.path;
    if (!filePath) {
      return res.status(400).json({ error: 'Uploaded file path not found', debug: cardImage });
    }
    try {
      const fileStream = fs.createReadStream(filePath);
      const blobPath = `cards/${orderId}/${cardImage.originalFilename}`;
      const { url } = await put(blobPath, fileStream, {
        access: 'public',
        addRandomSuffix: true,
      });
      return res.status(200).json({ url });
    } catch (e) {
      console.error('Blob upload error:', e);
      return res.status(500).json({ error: 'Failed to upload image' });
    }
  } catch (e) {
    console.error('Form parse error:', e);
    return res.status(400).json({ error: 'Error parsing form data' });
  }
} 