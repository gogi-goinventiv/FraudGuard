import { IncomingForm } from 'formidable';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import FormData from 'form-data';
import fetch from 'node-fetch';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ocr-'));

  try {
    const file = await new Promise((resolve, reject) => {
      const form = new IncomingForm({
        uploadDir: tempDir,
        keepExtensions: true,
        maxFileSize: 10 * 1024 * 1024,
      });
      form.parse(req, (err, fields, files) => {
        if (err) return reject(new Error('File upload error: ' + err.message));
        const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file;
        if (!uploadedFile) return reject(new Error('No file was uploaded.'));
        resolve(uploadedFile);
      });
    });

    const imageBuffer = await fs.readFile(file.filepath);
    const formData = new FormData();
    formData.append('file', imageBuffer, 'card.jpg');
    formData.append('OCREngine', '2');
    formData.append('scale', 'true');
    formData.append('isTable', 'false');
    formData.append('apikey', process.env.OCR_API_KEY);

    const ocrRes = await fetch('https://apipro1.ocr.space/parse/image', {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders(),
    });

    const ocrData = await ocrRes.json();
    const parsedText = ocrData?.ParsedResults?.[0]?.ParsedText || '';
    const matches = parsedText.match(/\d{4}/g);
    const last4 = matches ? matches[matches.length - 1] : null;

    res.status(200).json({
      last4,
      confidence: 100, // OCR.Space does not provide a confidence score
      rawText: parsedText,
    });

  } catch (error) {
    console.error('OCR handler error:', error);
    res.status(500).json({ error: 'OCR processing failed.', details: error.message });
  } finally {
    if (tempDir) {
      fs.rm(tempDir, { recursive: true, force: true }).catch(err => console.error("Failed to clean up temp directory:", err));
    }
  }
}
