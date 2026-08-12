/**
 * Servidor local: sirve los archivos estáticos y atiende /api.
 *
 * Usa el almacén en memoria salvo que existan las credenciales de Upstash en
 * el entorno, así que `npm run dev` funciona sin configurar nada.
 *
 *   node dev.js [puerto]
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { manejar } from './api/_lib/rutas.js';
import { crearStoreMemoria } from './api/_lib/store-memoria.js';
import { crearStoreRedis } from './api/_lib/store-redis.js';

const RAIZ = fileURLToPath(new URL('.', import.meta.url));
const PUERTO = Number(process.argv[2] ?? process.env.PORT ?? 3000);

// Se intenta Redis y se cae a memoria si no hay credenciales. Preguntar por
// nombres de variables aquí duplicaría un conocimiento que ya vive —y cambia—
// dentro de store-redis.js.
const { store, almacen } = (() => {
  try {
    return { store: crearStoreRedis(), almacen: 'Upstash Redis' };
  } catch {
    return { store: crearStoreMemoria(), almacen: 'memoria (solo desarrollo)' };
  }
})();

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

function responderJson(res, estado, cuerpo) {
  res.statusCode = estado;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(cuerpo));
}

async function leerCuerpo(req) {
  const trozos = [];
  for await (const trozo of req) trozos.push(trozo);
  if (trozos.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(trozos).toString('utf8'));
  } catch {
    return null;
  }
}

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PUERTO}`);
  const partes = url.pathname.split('/').filter(Boolean);

  if (partes[0] === 'api') {
    const cuerpo = req.method === 'GET' ? null : await leerCuerpo(req);
    try {
      const { estado, cuerpo: salida } = await manejar(
        {
          metodo: req.method,
          segmentos: partes.slice(1),
          cuerpo,
          consulta: Object.fromEntries(url.searchParams),
          ip: req.socket.remoteAddress,
          tokenProfesor: req.headers['x-token-profesor'] ?? null,
        },
        store,
      );
      responderJson(res, estado, salida);
    } catch (fallo) {
      console.error(fallo);
      responderJson(res, 503, { error: 'El servicio no está disponible' });
    }
    return;
  }

  // Archivos estáticos, con URLs limpias (/r sirve r.html) como en Vercel.
  let ruta = url.pathname === '/' ? '/index.html' : url.pathname;
  if (!extname(ruta)) ruta += '.html';

  const destino = join(RAIZ, normalize(ruta).replace(/^(\.\.[/\\])+/, ''));
  if (!destino.startsWith(RAIZ)) {
    res.statusCode = 403;
    res.end('Prohibido');
    return;
  }

  try {
    const contenido = await readFile(destino);
    res.setHeader('Content-Type', TIPOS[extname(destino)] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(contenido);
  } catch {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('No encontrado');
  }
});

servidor.listen(PUERTO, () => {
  console.log(`nube-palabras en http://localhost:${PUERTO}`);
  console.log(`almacén: ${almacen}`);
});
