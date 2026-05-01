// ============================================================
//  scripts/upload.js
//  Sube fotos y vídeos a Cloudinary con compresión automática
//  y ajusta los public_id para que el filtro funcione.
//
//  Uso:
//    npm run upload                        (pide la carpeta)
//    npm run upload -- ./fotos/Aranjuez    (carpeta concreta)
//    npm run upload -- ./fotos             (todas las subcarpetas)
// ============================================================

require("dotenv").config();
const cloudinary = require("cloudinary").v2;
const fs         = require("fs");
const path       = require("path");
const readline   = require("readline");

// ── Config ───────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key:    process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

const CLOUD_ROOT  = "Espa\u00f1a";          // carpeta raíz en Cloudinary
const IMAGE_EXTS  = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".tiff"]);
const VIDEO_EXTS  = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"]);

// ── Contadores globales ───────────────────────────────────────
const stats = { total: 0, subidas: 0, saltadas: 0, errores: 0, migradas: 0 };

// ── Helpers ───────────────────────────────────────────────────

function pregunta(texto) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => rl.question(texto, ans => { rl.close(); res(ans.trim()); }));
}

/** Recorre una carpeta de forma recursiva y devuelve todos los archivos */
function listarArchivos(dir) {
  const archivos = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      archivos.push(...listarArchivos(ruta));
    } else {
      archivos.push(ruta);
    }
  }
  return archivos;
}

/** Determina el public_id en Cloudinary a partir de la ruta local y la raíz local */
function publicId(rutaLocal, raizLocal) {
  const relativo   = path.relative(raizLocal, rutaLocal);          // Aranjuez/foto.jpg
  const sinExt     = relativo.replace(/\.[^.]+$/, "");             // Aranjuez/foto
  const normalizado = sinExt.split(path.sep).join("/");            // barras forward
  return `${CLOUD_ROOT}/${normalizado}`;                           // España/Aranjuez/foto
}

// ── Upload con compresión ─────────────────────────────────────

async function subirArchivo(rutaLocal, cloudId, tipo) {

  // Comprobamos si ya existe (evita re-subir y gastar cuota)
  try {
    await cloudinary.api.resource(cloudId, { resource_type: tipo });
    console.log(`  ⏭  Ya existe, saltado: ${cloudId}`);
    stats.saltadas++;
    return;
  } catch (_) {
    // No existe → subimos
  }

  const opcionesBase = {
    public_id:       cloudId,
    overwrite:       false,
    unique_filename: false,
    use_filename:    false,
    resource_type:   tipo,
    invalidate:      true,
  };

  const opcionesImagen = {
    ...opcionesBase,
    // Aplica compresión ANTES de almacenar (reduce el tamaño guardado en Cloudinary)
    transformation: [
      {
        quality:      "auto:good",  // compresión inteligente (~60-70% menos peso)
        fetch_format: "auto",       // convierte a WebP/AVIF si es más ligero
      },
    ],
  };

  const opcionesVideo = {
    ...opcionesBase,
    // Para vídeos: recodifica con H.264 optimizado
    eager: [
      {
        quality:     "auto:good",
        video_codec: "auto",        // H.264 o H.265 según soporte
        audio_codec: "aac",
      },
    ],
    eager_async: true,              // la recodificación ocurre en segundo plano
  };

  const opciones = tipo === "video" ? opcionesVideo : opcionesImagen;

  await cloudinary.uploader.upload(rutaLocal, opciones);
  console.log(`  ✅  Subida: ${cloudId}`);
  stats.subidas++;
}

// ── Migración de public_id (igual que tu script que funcionó) ─

async function migrarIds() {
  console.log("\n🔄  Comprobando public_ids para ajustar filtro…");

  let nextCursor = null;
  let total = 0, moved = 0, skipped = 0, errors = 0;

  do {
    const result = await cloudinary.api.resources({
      type:         "upload",
      max_results:  100,
      next_cursor:  nextCursor,
    });

    for (const img of result.resources) {
      total++;
      const folder = img.asset_folder;
      const oldId  = img.public_id;

      if (!folder || oldId.startsWith(folder)) {
        skipped++;
        continue;
      }

      const newId = `${folder}/${oldId}`;
      try {
        console.log(`  ➡️  ${oldId} → ${newId}`);
        await cloudinary.uploader.rename(oldId, newId, { invalidate: true });
        moved++;
      } catch (err) {
        console.error(`  ❌  Error con ${oldId}:`, err.message);
        errors++;
      }
    }

    nextCursor = result.next_cursor;
  } while (nextCursor);

  stats.migradas = moved;

  console.log(`\n  Migración — Total: ${total} | Renombradas: ${moved} | Saltadas: ${skipped} | Errores: ${errors}`);
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║     Subida optimizada a Cloudinary       ║");
  console.log("╚══════════════════════════════════════════╝\n");

  // ── 1. Determinar carpeta local ──
  let raizLocal = process.argv[2];

  if (!raizLocal) {
    raizLocal = await pregunta("📁  Ruta de la carpeta local a subir (ej: ./fotos/Aranjuez): ");
  }

  raizLocal = path.resolve(raizLocal);

  if (!fs.existsSync(raizLocal)) {
    console.error(`❌  La carpeta no existe: ${raizLocal}`);
    process.exit(1);
  }

  // ── 2. Listar archivos ──
  const archivos = listarArchivos(raizLocal).filter(f => {
    const ext = path.extname(f).toLowerCase();
    return IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext);
  });

  if (archivos.length === 0) {
    console.log("⚠️  No se encontraron imágenes ni vídeos en esa carpeta.");
    process.exit(0);
  }

  console.log(`\n📸  ${archivos.length} archivo(s) encontrado(s) en: ${raizLocal}`);
  console.log(`☁️  Se subirán bajo: ${CLOUD_ROOT}/\n`);

  const confirmar = await pregunta("¿Continuar? (s/n): ");
  if (confirmar.toLowerCase() !== "s") {
    console.log("Cancelado.");
    process.exit(0);
  }

  // ── 3. Subir archivos ──
  console.log("\n── Iniciando subida ──────────────────────────\n");

  for (const rutaLocal of archivos) {
    stats.total++;
    const ext  = path.extname(rutaLocal).toLowerCase();
    const tipo = VIDEO_EXTS.has(ext) ? "video" : "image";
    const cId  = publicId(rutaLocal, raizLocal);

    console.log(`[${stats.total}/${archivos.length}] ${path.basename(rutaLocal)}`);

    try {
      await subirArchivo(rutaLocal, cId, tipo);
    } catch (err) {
      console.error(`  ❌  Error: ${err.message}`);
      stats.errores++;
    }
  }

  // ── 4. Migrar IDs ──
  await migrarIds();

  // ── 5. Resumen ──
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║               RESUMEN FINAL              ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║  Total procesados : ${String(stats.total).padEnd(20)}║`);
  console.log(`║  ✅ Subidas        : ${String(stats.subidas).padEnd(20)}║`);
  console.log(`║  ⏭  Saltadas       : ${String(stats.saltadas).padEnd(20)}║`);
  console.log(`║  🔄 IDs migrados   : ${String(stats.migradas).padEnd(20)}║`);
  console.log(`║  ❌ Errores        : ${String(stats.errores).padEnd(20)}║`);
  console.log("╚══════════════════════════════════════════╝\n");
}

main();
