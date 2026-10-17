// Rota PWA pra extrair texto de PDF enviado pelo cliente.
// POST /api/pwa/pdf/extract (multipart, campo "file") - retorna {text, numPages, info, truncated, bytes}
// Auth: clientAuthMiddleware (mesma do /api/pwa/conversations)
import { Router, Response } from "express";
import multer from "multer";
import { clientAuthMiddleware, ClientAuthRequest } from "../middleware/auth-pwa";
import { extractTextFromPdf } from "../lib/pdf.js";

const router = Router();
router.use(clientAuthMiddleware);

// Limite: 20MB por PDF (cobre a maioria dos PDFs reais)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
      cb(null, true);
    } else {
      cb(new Error("Apenas arquivos PDF sao aceitos"));
    }
  },
});

router.post("/extract", upload.single("file"), async (req: ClientAuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado. Use o campo "file" no multipart.' });
    const result = await extractTextFromPdf(req.file.buffer, { maxChars: 50000, includeInfo: true });
    res.json({
      filename: req.file.originalname,
      size: req.file.size,
      numPages: result.numPages,
      text: result.text,
      info: result.info,
      truncated: result.truncated,
    });
  } catch (e: any) {
    if (e?.message?.includes("File too large")) {
      return res.status(413).json({ error: "PDF muito grande (max 20MB)" });
    }
    if (e?.message?.includes("Apenas arquivos PDF")) {
      return res.status(415).json({ error: e.message });
    }
    console.error("[pwa-pdf] erro:", e);
    res.status(500).json({ error: "Falha ao extrair texto do PDF: " + (e?.message || "erro") });
  }
});

export default router;
