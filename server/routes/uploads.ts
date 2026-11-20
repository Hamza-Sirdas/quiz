import { Router } from 'express';
import { requireTeacher } from '../middleware/requireTeacher';
import {
  ALLOWED_IMAGE_MIMES,
  checkUploadStorageWritable,
  imageUpload,
  MAX_IMAGE_SIZE_BYTES,
  saveValidatedImageUpload,
} from '../middleware/upload';

export const uploadsRouter = Router();

uploadsRouter.get('/status', requireTeacher, async (_req, res) => {
  const configured = await checkUploadStorageWritable();
  res.json({
    configured,
    maxSizeBytes: MAX_IMAGE_SIZE_BYTES,
    allowedTypes: ALLOWED_IMAGE_MIMES,
  });
});

uploadsRouter.post('/', requireTeacher, imageUpload.single('file'), async (req, res) => {
  if (!req.file?.buffer) {
    res.status(400).json({ message: 'Yüklenecek görsel dosyası seçilmedi.' });
    return;
  }

  const saved = await saveValidatedImageUpload(req.file.buffer);
  res.status(201).json({
    url: saved.url,
  });
});
