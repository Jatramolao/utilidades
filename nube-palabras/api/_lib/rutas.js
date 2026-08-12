/**
 * Lógica de la API. Agnóstica del transporte (Vercel o servidor local) y del
 * almacén (Redis o memoria), para que se pueda probar entera sin red.
 */

import {
  normalizar,
  limpiarOriginal,
  esPalabraValida,
  MAX_LARGO,
} from '../../js/normalizar.js';
import {
  generarCodigo,
  esCodigoValido,
  normalizarCodigo,
} from '../../js/codigo.js';

export const TTL = 6 * 60 * 60; // 6 horas, renovadas en cada escritura
export const MAX_PALABRAS = 3;
export const MAX_LARGO_PREGUNTA = 200;
export const MAX_ENVIOS_POR_IP = 20; // por minuto
export const VENTANA_IP = 60;

const k = {
  sala: (c) => `sala:${c}`,
  pregunta: (c, n) => `sala:${c}:p:${n}`,
  palabras: (c, n) => `sala:${c}:p:${n}:palabras`,
  formas: (c, n) => `sala:${c}:p:${n}:formas`,
  cuota: (c, n) => `sala:${c}:p:${n}:cuota`,
  ip: (ip) => `ip:${ip}`,
};

const ok = (cuerpo) => ({ estado: 200, cuerpo });
const error = (estado, mensaje) => ({ estado, cuerpo: { error: mensaje } });

function ahoraISO() {
  return new Date().toISOString();
}

function nuevoToken() {
  return globalThis.crypto.randomUUID().replaceAll('-', '');
}

async function renovar(store, claves) {
  for (const clave of claves) await store.expire(clave, TTL);
}

/**
 * Todas las acciones de control exigen el token que se generó al crear la sala.
 * Es el único control de acceso del sistema: sin él, cualquier alumno que ve el
 * código proyectado podría cerrar la votación o borrar palabras.
 */
async function exigirProfesor(store, codigo, tokenEntregado) {
  const sala = await store.hgetall(k.sala(codigo));
  if (!sala) return { fallo: error(404, 'Esta sala ya no existe') };
  if (!tokenEntregado || tokenEntregado !== sala.tokenProfesor) {
    return { fallo: error(403, 'Solo el profesor puede hacer esto') };
  }
  return { sala };
}

// --- Acciones -------------------------------------------------------------

async function crearSala(store) {
  let codigo = null;
  for (let intento = 0; intento < 10 && codigo === null; intento++) {
    const candidato = generarCodigo();
    if (!(await store.existe(k.sala(candidato)))) codigo = candidato;
  }
  if (codigo === null) {
    return error(503, 'No se pudo generar un código libre. Intenta de nuevo');
  }

  const tokenProfesor = nuevoToken();
  await store.hset(k.sala(codigo), {
    creada: ahoraISO(),
    tokenProfesor,
    preguntaActiva: '',
    contadorPreguntas: '0',
  });
  await renovar(store, [k.sala(codigo)]);

  return ok({ codigo, tokenProfesor, ttlSegundos: TTL });
}

async function lanzarPregunta(store, codigo, cuerpo, tokenProfesor) {
  const { sala, fallo } = await exigirProfesor(store, codigo, tokenProfesor);
  if (fallo) return fallo;

  const texto = typeof cuerpo?.texto === 'string' ? cuerpo.texto.trim() : '';
  if (texto.length === 0) return error(400, 'La pregunta no puede ir vacía');
  if (texto.length > MAX_LARGO_PREGUNTA) {
    return error(400, `La pregunta no puede pasar de ${MAX_LARGO_PREGUNTA} caracteres`);
  }

  // Si quedó una pregunta abierta, se cierra: solo una recibe respuestas.
  const anterior = sala.preguntaActiva;
  if (anterior) {
    await store.hset(k.pregunta(codigo, anterior), { estado: 'cerrada' });
  }

  const n = Number(sala.contadorPreguntas || 0) + 1;
  await store.hset(k.pregunta(codigo, n), {
    texto,
    estado: 'abierta',
    creada: ahoraISO(),
  });
  await store.hset(k.sala(codigo), {
    preguntaActiva: String(n),
    contadorPreguntas: String(n),
  });
  await renovar(store, [k.sala(codigo), k.pregunta(codigo, n)]);

  return ok({ n, texto, estado: 'abierta' });
}

async function cerrarPregunta(store, codigo, n, tokenProfesor) {
  const { fallo } = await exigirProfesor(store, codigo, tokenProfesor);
  if (fallo) return fallo;

  const pregunta = await store.hgetall(k.pregunta(codigo, n));
  if (!pregunta) return error(404, 'Esa pregunta ya no existe');

  await store.hset(k.pregunta(codigo, n), { estado: 'cerrada' });
  await renovar(store, [k.sala(codigo), k.pregunta(codigo, n)]);
  return ok({ n: Number(n), estado: 'cerrada' });
}

async function estadoSala(store, codigo, tokenDispositivo) {
  const sala = await store.hgetall(k.sala(codigo));
  if (!sala) return error(404, 'Esta sala ya no existe');

  const n = sala.preguntaActiva;
  if (!n) {
    return ok({
      codigo,
      preguntaActiva: null,
      maxPalabras: MAX_PALABRAS,
      maxLargo: MAX_LARGO,
    });
  }

  const pregunta = await store.hgetall(k.pregunta(codigo, n));
  if (!pregunta) {
    return ok({
      codigo,
      preguntaActiva: null,
      maxPalabras: MAX_PALABRAS,
      maxLargo: MAX_LARGO,
    });
  }

  const usadas = tokenDispositivo
    ? Number((await store.hget(k.cuota(codigo, n), tokenDispositivo)) ?? 0)
    : 0;

  return ok({
    codigo,
    preguntaActiva: Number(n),
    texto: pregunta.texto,
    estado: pregunta.estado,
    usadas,
    maxPalabras: MAX_PALABRAS,
    maxLargo: MAX_LARGO,
  });
}

async function enviarPalabras(store, codigo, cuerpo, ip) {
  if (ip) {
    const envios = await store.incrConTtl(k.ip(ip), VENTANA_IP);
    if (envios > MAX_ENVIOS_POR_IP) {
      return error(429, 'Demasiados envíos seguidos. Espera un momento');
    }
  }

  const sala = await store.hgetall(k.sala(codigo));
  if (!sala) return error(404, 'Esta sala ya no existe');

  const n = sala.preguntaActiva;
  if (!n) return error(409, 'Todavía no hay una pregunta activa');

  const pregunta = await store.hgetall(k.pregunta(codigo, n));
  if (!pregunta) return error(409, 'Todavía no hay una pregunta activa');
  if (pregunta.estado !== 'abierta') {
    return error(409, 'La votación de esta pregunta ya se cerró');
  }

  const token = typeof cuerpo?.token === 'string' ? cuerpo.token.trim() : '';
  if (token.length < 8 || token.length > 64) {
    return error(400, 'Identificador de dispositivo inválido');
  }

  const entrada = Array.isArray(cuerpo?.palabras) ? cuerpo.palabras : [];
  if (entrada.length > MAX_PALABRAS * 2) {
    return error(400, 'Demasiadas palabras en un solo envío');
  }

  // Se descarta lo inválido en silencio y se deduplica: si un alumno escribe la
  // misma palabra en dos campos, cuenta una vez. Si no, podría inflar su
  // término favorito por triplicado él solo.
  const vistas = new Set();
  const candidatas = [];
  for (const cruda of entrada) {
    if (!esPalabraValida(cruda)) continue;
    const original = limpiarOriginal(cruda);
    const clave = normalizar(original);
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    candidatas.push({ clave, original });
  }

  const usadas = Number((await store.hget(k.cuota(codigo, n), token)) ?? 0);
  const disponibles = Math.max(0, MAX_PALABRAS - usadas);
  if (disponibles === 0) {
    return error(409, 'Ya enviaste tus palabras para esta pregunta');
  }

  const aceptadas = candidatas.slice(0, disponibles);
  // La grafía se registra ANTES que el conteo. Son dos viajes distintos al
  // almacén y el proyector consulta cada 2 segundos: si una consulta cae justo
  // en medio, es preferible que la palabra todavía no aparezca a que aparezca
  // con su forma normalizada —sin tildes ni mayúsculas— que es lo que pasaba
  // en producción, donde la latencia hace la ventana real.
  for (const { clave, original } of aceptadas) {
    await store.hincrby(k.formas(codigo, n), `${clave}::${original}`, 1);
    await store.hincrby(k.palabras(codigo, n), clave, 1);
  }
  if (aceptadas.length > 0) {
    await store.hincrby(k.cuota(codigo, n), token, aceptadas.length);
  }

  await renovar(store, [
    k.sala(codigo),
    k.pregunta(codigo, n),
    k.palabras(codigo, n),
    k.formas(codigo, n),
    k.cuota(codigo, n),
  ]);

  return ok({
    aceptadas: aceptadas.length,
    usadas: usadas + aceptadas.length,
    maxPalabras: MAX_PALABRAS,
  });
}

/**
 * Elige, para cada término, la forma original que más alumnos escribieron.
 * Así la nube muestra "Fotografía" y no "fotografia".
 */
function mejoresFormas(formas) {
  const mejor = new Map();
  for (const [campo, conteoTexto] of Object.entries(formas ?? {})) {
    const separador = campo.indexOf('::');
    if (separador === -1) continue;
    const clave = campo.slice(0, separador);
    const original = campo.slice(separador + 2);
    const conteo = Number(conteoTexto) || 0;
    const actual = mejor.get(clave);
    // Empate resuelto alfabéticamente para que el resultado sea estable entre
    // consultas: la nube no puede cambiar de grafía sola cada 2 segundos.
    if (
      !actual ||
      conteo > actual.conteo ||
      (conteo === actual.conteo && original < actual.original)
    ) {
      mejor.set(clave, { original, conteo });
    }
  }
  return mejor;
}

async function verNube(store, codigo, n) {
  const pregunta = await store.hgetall(k.pregunta(codigo, n));
  if (!pregunta) return error(404, 'Esa pregunta ya no existe');

  const [conteos, formas, participantes] = await Promise.all([
    store.hgetall(k.palabras(codigo, n)),
    store.hgetall(k.formas(codigo, n)),
    store.hlen(k.cuota(codigo, n)),
  ]);

  const mejor = mejoresFormas(formas);
  const palabras = Object.entries(conteos ?? {})
    .map(([clave, conteo]) => ({
      clave,
      texto: mejor.get(clave)?.original ?? clave,
      conteo: Number(conteo) || 0,
    }))
    .filter((p) => p.conteo > 0)
    .sort((a, b) => b.conteo - a.conteo || a.clave.localeCompare(b.clave));

  return ok({
    n: Number(n),
    texto: pregunta.texto,
    estado: pregunta.estado,
    participantes,
    palabras,
  });
}

async function eliminarPalabra(store, codigo, n, clave, tokenProfesor) {
  const { fallo } = await exigirProfesor(store, codigo, tokenProfesor);
  if (fallo) return fallo;

  await store.hdel(k.palabras(codigo, n), clave);

  // Las formas originales de esa palabra también se van: si no, reaparecería
  // con su grafía vieja en cuanto alguien la vuelva a escribir.
  const formas = (await store.hgetall(k.formas(codigo, n))) ?? {};
  for (const campo of Object.keys(formas)) {
    if (campo.startsWith(`${clave}::`)) {
      await store.hdel(k.formas(codigo, n), campo);
    }
  }

  return ok({ eliminada: clave });
}

// --- Enrutamiento ---------------------------------------------------------

/**
 * @param {object} peticion
 * @param {string} peticion.metodo
 * @param {string[]} peticion.segmentos  partes de la ruta después de /api
 * @param {object} [peticion.cuerpo]
 * @param {object} [peticion.consulta]   parámetros de query
 * @param {string} [peticion.ip]
 * @param {string} [peticion.tokenProfesor]  cabecera x-token-profesor
 */
export async function manejar(peticion, store) {
  const { metodo, segmentos, cuerpo, consulta = {}, ip, tokenProfesor } = peticion;

  if (segmentos[0] !== 'sala') return error(404, 'Ruta desconocida');

  // POST /api/sala
  if (segmentos.length === 1) {
    if (metodo !== 'POST') return error(405, 'Método no permitido');
    return crearSala(store);
  }

  const codigo = normalizarCodigo(segmentos[1]);
  if (!esCodigoValido(codigo)) return error(400, 'Código de sala inválido');

  // GET /api/sala/:codigo
  if (segmentos.length === 2) {
    if (metodo !== 'GET') return error(405, 'Método no permitido');
    return estadoSala(store, codigo, consulta.token);
  }

  // POST /api/sala/:codigo/palabras
  if (segmentos.length === 3 && segmentos[2] === 'palabras') {
    if (metodo !== 'POST') return error(405, 'Método no permitido');
    return enviarPalabras(store, codigo, cuerpo, ip);
  }

  // POST /api/sala/:codigo/pregunta
  if (segmentos.length === 3 && segmentos[2] === 'pregunta') {
    if (metodo !== 'POST') return error(405, 'Método no permitido');
    return lanzarPregunta(store, codigo, cuerpo, tokenProfesor);
  }

  if (segmentos[2] !== 'pregunta') return error(404, 'Ruta desconocida');

  const n = Number(segmentos[3]);
  if (!Number.isInteger(n) || n < 1) return error(400, 'Pregunta inválida');

  // POST /api/sala/:codigo/pregunta/:n/cerrar
  if (segmentos.length === 5 && segmentos[4] === 'cerrar') {
    if (metodo !== 'POST') return error(405, 'Método no permitido');
    return cerrarPregunta(store, codigo, n, tokenProfesor);
  }

  // GET /api/sala/:codigo/pregunta/:n/nube
  if (segmentos.length === 5 && segmentos[4] === 'nube') {
    if (metodo !== 'GET') return error(405, 'Método no permitido');
    return verNube(store, codigo, n);
  }

  // DELETE /api/sala/:codigo/pregunta/:n/palabra/:clave
  if (segmentos.length === 6 && segmentos[4] === 'palabra') {
    if (metodo !== 'DELETE') return error(405, 'Método no permitido');
    const clave = decodeURIComponent(segmentos[5]);
    return eliminarPalabra(store, codigo, n, clave, tokenProfesor);
  }

  return error(404, 'Ruta desconocida');
}
