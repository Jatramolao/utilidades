import test from 'node:test';
import assert from 'node:assert/strict';
import { crearStoreRedis, leerCredenciales } from '../api/_lib/store-redis.js';

const UPSTASH = {
  UPSTASH_REDIS_REST_URL: 'https://ejemplo.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'token-upstash',
};

// La integración de Upstash del Marketplace de Vercel NO crea las variables
// con el prefijo UPSTASH_: las crea con el prefijo KV_, por compatibilidad con
// Vercel KV. Dar por hecho lo primero dejó la app publicada sin poder abrir una
// sola sala.
const KV = {
  KV_REST_API_URL: 'https://ejemplo.upstash.io',
  KV_REST_API_TOKEN: 'token-kv',
};

test('acepta los nombres propios de Upstash', () => {
  const { url, token } = leerCredenciales(UPSTASH);
  assert.equal(url, 'https://ejemplo.upstash.io');
  assert.equal(token, 'token-upstash');
});

test('acepta los nombres KV_ que crea la integración de Vercel', () => {
  const { url, token } = leerCredenciales(KV);
  assert.equal(url, 'https://ejemplo.upstash.io');
  assert.equal(token, 'token-kv');
});

test('si están los dos juegos de nombres, mandan los de Upstash', () => {
  const { token } = leerCredenciales({ ...KV, ...UPSTASH });
  assert.equal(token, 'token-upstash');
});

test('ignora el token de solo lectura: la app necesita escribir', () => {
  const soloLectura = {
    KV_REST_API_URL: 'https://ejemplo.upstash.io',
    KV_REST_API_READ_ONLY_TOKEN: 'token-de-solo-lectura',
  };
  assert.throws(() => leerCredenciales(soloLectura), /Falta/);
});

test('no confunde REDIS_URL (protocolo redis://) con la API REST', () => {
  // REDIS_URL viene en la misma integración pero es para clientes TCP, no HTTP.
  // Usarla como base de la API REST daría fallos de red imposibles de leer.
  const soloTcp = {
    REDIS_URL: 'rediss://default:clave@ejemplo.upstash.io:6379',
    KV_REST_API_TOKEN: 'token-kv',
  };
  assert.throws(() => leerCredenciales(soloTcp), /Falta/);
});

test('sin credenciales avisa qué nombres buscó', () => {
  assert.throws(() => leerCredenciales({}), (fallo) => {
    assert.match(fallo.message, /UPSTASH_REDIS_REST_URL/);
    assert.match(fallo.message, /KV_REST_API_URL/);
    return true;
  });
});

test('crearStoreRedis funciona con las variables KV_ y expone los comandos', () => {
  const store = crearStoreRedis({ entorno: KV });
  for (const metodo of ['hset', 'hgetall', 'hget', 'hincrby', 'hdel', 'hlen', 'expire', 'existe', 'incrConTtl']) {
    assert.equal(typeof store[metodo], 'function', `falta ${metodo}`);
  }
});

test('los argumentos explícitos ganan sobre el entorno', () => {
  const { url, token } = leerCredenciales(KV, {
    url: 'https://otra.upstash.io',
    token: 'token-explicito',
  });
  assert.equal(url, 'https://otra.upstash.io');
  assert.equal(token, 'token-explicito');
});
