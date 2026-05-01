// ================================================
//  server.js — Servidor seguro para viajes-conmigo
//  Las credenciales NUNCA salen de aquí hacia el navegador
// ================================================

require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Credenciales (solo viven en el servidor) ────────────────────────────────
const CLOUD_NAME = process.env.CLOUD_NAME;
const API_KEY    = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;

if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
  console.error("❌  Faltan credenciales en el archivo .env");
  process.exit(1);
}

const AUTH_HEADER = "Basic " + Buffer.from(`${API_KEY}:${API_SECRET}`).toString("base64");
const CLOUDINARY  = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}`;
const ROOT_FOLDER = "España";

// ── Helpers ─────────────────────────────────────────────────────────────────

async function cloudinaryGet(url) {
  const res = await fetch(url, { headers: { Authorization: AUTH_HEADER } });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cloudinary ${res.status}: ${err}`);
  }
  return res.json();
}

// ── Servir el frontend ───────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

// ── API: subcarpetas de España ───────────────────────────────────────────────
app.get("/api/folders", async (_req, res) => {
  try {
    const encoded = encodeURIComponent(ROOT_FOLDER);
    const data    = await cloudinaryGet(`${CLOUDINARY}/folders/${encoded}`);
    const folders = (data.folders || []).map((f) => ({
      name: f.name,
      path: f.path,
    }));
    res.json(folders);
  } catch (err) {
    console.error("Error al obtener carpetas:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── API: fotos de una subcarpeta ─────────────────────────────────────────────
app.get("/api/photos/:folder", async (req, res) => {
  try {
    const folder  = decodeURIComponent(req.params.folder);
    const prefix  = encodeURIComponent(`${ROOT_FOLDER}/${folder}`);
    const url     = `${CLOUDINARY}/resources/image?prefix=${prefix}&type=upload&max_results=500`;
    const data    = await cloudinaryGet(url);

    const photos = (data.resources || []).map((r) => ({
      public_id:  r.public_id,
      url:        r.secure_url,
      width:      r.width,
      height:     r.height,
      format:     r.format,
      created_at: r.created_at,
    }));

    res.json(photos);
  } catch (err) {
    console.error("Error al obtener fotos:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Arrancar ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅  Servidor iniciado`);
  console.log(`🌍  Abre tu navegador en: http://localhost:${PORT}\n`);
});
