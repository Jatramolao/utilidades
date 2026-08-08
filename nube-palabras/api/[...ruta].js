/**
 * Entrada de la API en Vercel. Una sola función para todas las rutas.
 * Aquí solo se traduce HTTP ↔ la lógica de `_lib/rutas.js`.
 */

import { manejar } from './_lib/rutas.js';
import { crearStoreRedis } from './_lib/store-redis.js';

let store = null;

function obtenerStore() {
  if (!store) store = crearStoreRedis();
  return store;
}

function leerIp(req) {
  const reenviada = req.headers['x-forwarded-for'];
  if (typeof reenviada === 'string') return reenviada.split(',')[0].trim();
  return req.socket?.remoteAddress ?? null;
}

async function leerCuerpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  const trozos = [];
  for await (const trozo of req) trozos.push(trozo);
  if (trozos.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(trozos).toString('utf8'));
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host ?? 'localhost'}`);
  const segmentos = url.pathname.split('/').filter(Boolean);
  if (segmentos[0] === 'api') segmentos.shift();

  const consulta = Object.fromEntries(url.searchParams);
  const cuerpo = req.method === 'GET' ? null : await leerCuerpo(req);

  let resultado;
  try {
    resultado = await manejar(
      {
        metodo: req.method,
        segmentos,
        cuerpo,
        consulta,
        ip: leerIp(req),
        tokenProfesor: req.headers['x-token-profesor'] ?? null,
      },
      obtenerStore(),
    );
  } catch (fallo) {
    console.error('[nube-palabras]', fallo);
    // El primer despliegue suele ocurrir antes de conectar la base. Sin este
    // caso aparte el síntoma sería un "no disponible" genérico, y habría que
    // ir a los registros para descubrir que solo faltan dos variables.
    const faltaBase = fallo.message?.includes('UPSTASH');
    resultado = {
      estado: faltaBase ? 500 : 503,
      cuerpo: {
        error: faltaBase
          ? 'Falta conectar la base Redis. Agrega Upstash en Storage y vuelve a desplegar.'
          : 'El servicio no está disponible. Reintentando…',
      },
    };
  }

  res.statusCode = resultado.estado;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(resultado.cuerpo));
}
