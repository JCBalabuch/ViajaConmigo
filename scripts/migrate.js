// ============================================================
//  scripts/migrate.js
//  Ajusta los public_id de Cloudinary para que el filtro
//  por carpeta funcione correctamente.
//  (Ejecutar solo si subes fotos por otro medio)
//
//  Uso: npm run migrate
// ============================================================

require("dotenv").config();
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key:    process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

async function migrarIds() {
  console.log("🔄  Iniciando migración de public_ids…\n");

  let nextCursor = null;
  let total = 0, moved = 0, skipped = 0, errors = 0;

  do {
    const result = await cloudinary.api.resources({
      type:        "upload",
      max_results: 100,
      next_cursor: nextCursor,
    });

    for (const img of result.resources) {
      total++;
      const folder = img.asset_folder;
      const oldId  = img.public_id;

      if (!folder) {
        console.log(`  ⚠️  Sin carpeta, saltado: ${oldId}`);
        skipped++;
        continue;
      }

      if (oldId.startsWith(folder)) {
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

  console.log("\n===== RESUMEN =====");
  console.log("Total:      ", total);
  console.log("Renombradas:", moved);
  console.log("Saltadas:   ", skipped);
  console.log("Errores:    ", errors);
}

migrarIds();
