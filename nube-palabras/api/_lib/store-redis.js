/**
 * Almacén sobre Upstash Redis vía su API REST.
 *
 * Se habla HTTP con `fetch`, sin cliente ni dependencias de npm: son ocho
 * comandos y no vale la pena arrastrar un paquete por ellos.
 *
 * Credenciales: se aceptan los dos juegos de nombres que existen en la práctica.
 *
 *   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
 *     los que usa Upstash directamente (upstash.com, o variables puestas a mano)
 *
 *   KV_REST_API_URL / KV_REST_API_TOKEN
 *     los que crea la integración de Upstash del Marketplace de Vercel, por
 *     compatibilidad con Vercel KV. Es el caso normal al conectar desde la
 *     pestaña Storage, y dar por hecho el otro juego dejó la app publicada sin
 *     poder abrir una sola sala.
 *
 * Se ignoran a propósito dos variables que llegan en el mismo lote:
 *   KV_REST_API_READ_ONLY_TOKEN — no sirve: la app escribe
 *   KV_URL / REDIS_URL          — son rediss:// para clientes TCP, no la API REST
 */

const NOMBRES_URL = ['UPSTASH_REDIS_REST_URL', 'KV_REST_API_URL'];
const NOMBRES_TOKEN = ['UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_TOKEN'];

const primero = (entorno, nombres) => {
  for (const nombre of nombres) {
    const valor = entorno[nombre];
    if (valor) return valor;
  }
  return undefined;
};

/** Resuelve las credenciales o explica exactamente qué nombres buscó. */
export function leerCredenciales(entorno = process.env, explicitas = {}) {
  const url = explicitas.url ?? primero(entorno, NOMBRES_URL);
  const token = explicitas.token ?? primero(entorno, NOMBRES_TOKEN);

  if (!url || !token) {
    throw new Error(
      'Falta la conexión a Redis. Se buscó ' +
        `${NOMBRES_URL.join(' o ')} para la URL y ` +
        `${NOMBRES_TOKEN.join(' o ')} para el token.`,
    );
  }
  return { url, token };
}

export function crearStoreRedis({ entorno = process.env, ...explicitas } = {}) {
  const { url, token } = leerCredenciales(entorno, explicitas);
  const base = url.replace(/\/+$/, '');

  async function comando(...partes) {
    const respuesta = await fetch(base, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(partes.map(String)),
    });
    if (!respuesta.ok) {
      throw new Error(`Redis respondió ${respuesta.status}`);
    }
    const { result, error } = await respuesta.json();
    if (error) throw new Error(`Redis: ${error}`);
    return result;
  }

  function desdePlano(plano) {
    if (!Array.isArray(plano) || plano.length === 0) return null;
    const objeto = {};
    for (let i = 0; i < plano.length; i += 2) objeto[plano[i]] = plano[i + 1];
    return objeto;
  }

  return {
    async hset(clave, objeto) {
      const partes = [];
      for (const [campo, valor] of Object.entries(objeto)) {
        partes.push(campo, String(valor));
      }
      if (partes.length === 0) return;
      await comando('HSET', clave, ...partes);
    },

    async hgetall(clave) {
      return desdePlano(await comando('HGETALL', clave));
    },

    async hget(clave, campo) {
      return await comando('HGET', clave, campo);
    },

    async hincrby(clave, campo, delta) {
      return Number(await comando('HINCRBY', clave, campo, delta));
    },

    async hdel(clave, campo) {
      return Number(await comando('HDEL', clave, campo));
    },

    async hlen(clave) {
      return Number(await comando('HLEN', clave));
    },

    async expire(clave, segundos) {
      await comando('EXPIRE', clave, segundos);
    },

    async existe(clave) {
      return Number(await comando('EXISTS', clave)) === 1;
    },

    async incrConTtl(clave, segundos) {
      const n = Number(await comando('INCR', clave));
      if (n === 1) await comando('EXPIRE', clave, segundos);
      return n;
    },
  };
}
