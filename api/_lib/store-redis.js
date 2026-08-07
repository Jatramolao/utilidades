/**
 * Almacén sobre Upstash Redis vía su API REST.
 *
 * Se habla HTTP con `fetch`, sin cliente ni dependencias de npm: son ocho
 * comandos y no vale la pena arrastrar un paquete por ellos.
 *
 * Variables de entorno (las entrega la integración de Upstash en Vercel):
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 */

export function crearStoreRedis({
  url = process.env.UPSTASH_REDIS_REST_URL,
  token = process.env.UPSTASH_REDIS_REST_TOKEN,
} = {}) {
  if (!url || !token) {
    throw new Error(
      'Faltan UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN en el entorno.',
    );
  }
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
