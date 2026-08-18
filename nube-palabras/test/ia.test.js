import test from 'node:test';
import assert from 'node:assert/strict';
import {
  armarPrompt,
  recortar,
  leerClave,
  crearLector,
  crearLectorFalso,
  MAX_LECTURA,
  MODELO,
  FALTA_CLAVE,
} from '../api/_lib/ia.js';

const PALABRAS = [
  { clave: 'el zoom', texto: 'el zoom', conteo: 1 },
  { clave: 'diafragma', texto: 'diafragma', conteo: 4 },
  { clave: 'apertura', texto: 'Apertura', conteo: 4 },
];

/** Responde como `fetch` sin salir a la red. */
function fetchFalso(cuerpo, { ok = true, status = 200 } = {}) {
  const llamadas = [];
  const buscar = async (url, opciones) => {
    llamadas.push({ url, opciones });
    return { ok, status, json: async () => cuerpo };
  };
  return { buscar, llamadas };
}

const conLectura = (texto) => ({
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: JSON.stringify({ lectura: texto }) }],
});

// --- armarPrompt ----------------------------------------------------------

test('el prompt incluye la pregunta y todas las respuestas con su conteo', () => {
  const prompt = armarPrompt('¿Qué controla la profundidad de campo?', PALABRAS);

  assert.match(prompt, /¿Qué controla la profundidad de campo\?/);
  for (const { texto, conteo } of PALABRAS) {
    assert.ok(prompt.includes(`${texto} — ${conteo}`), `falta "${texto}"`);
  }
});

test('el prompt ordena por conteo y desempata alfabéticamente', () => {
  // El orden estable importa por dos razones: la caché de prompt del modelo
  // solo sirve si el prefijo no cambia, y dos lecturas del mismo estado
  // deberían partir de la misma entrada.
  const lineas = armarPrompt('P', PALABRAS).split('\n').slice(3);

  assert.deepEqual(lineas, ['Apertura — 4', 'diafragma — 4', 'el zoom — 1']);
});

test('el prompt no depende del orden en que lleguen las palabras', () => {
  const alReves = [...PALABRAS].reverse();
  assert.equal(armarPrompt('P', PALABRAS), armarPrompt('P', alReves));
});

test('armarPrompt no muta la lista que recibe', () => {
  const copia = [...PALABRAS];
  armarPrompt('P', PALABRAS);
  assert.deepEqual(PALABRAS, copia);
});

// --- recortar -------------------------------------------------------------

test('un texto corto pasa intacto', () => {
  assert.equal(recortar('El curso converge en una sola idea.'), 'El curso converge en una sola idea.');
});

test('recortar normaliza espacios y saltos de línea', () => {
  assert.equal(recortar('  dos   líneas\n  juntas '), 'dos líneas juntas');
});

test('recortar respeta el máximo y corta en límite de palabra', () => {
  const largo = Array.from({ length: 120 }, (_, i) => `palabra${i}`).join(' ');
  const corto = recortar(largo);

  assert.ok(corto.length <= MAX_LECTURA, `${corto.length} caracteres`);
  assert.ok(corto.endsWith('…'));
  // Sin corte a mitad de palabra: lo anterior a la elipsis es una palabra entera.
  assert.ok(largo.startsWith(corto.slice(0, -1)));
  assert.ok(/palabra\d+$/.test(corto.slice(0, -1)));
});

test('recortar no deja puntuación colgando antes de la elipsis', () => {
  const texto = `${'x'.repeat(MAX_LECTURA - 20)} final, y sigue con mucho más texto`;
  assert.ok(!/[,;:]…$/.test(recortar(texto)));
});

// --- credencial -----------------------------------------------------------

test('sin ANTHROPIC_API_KEY el fallo dice exactamente qué falta', () => {
  assert.throws(() => leerClave({}), (e) => {
    assert.ok(e.message.startsWith(FALTA_CLAVE));
    assert.match(e.message, /ANTHROPIC_API_KEY/);
    return true;
  });
});

test('con la clave en el entorno, se usa', () => {
  assert.equal(leerClave({ ANTHROPIC_API_KEY: 'sk-ant-x' }), 'sk-ant-x');
});

// --- la llamada -----------------------------------------------------------

test('la petición lleva la clave, la versión y el modelo', async () => {
  const { buscar, llamadas } = fetchFalso(conLectura('Todo converge.'));
  await crearLector({ clave: 'sk-ant-x', buscar }).leer('P', PALABRAS);

  assert.equal(llamadas.length, 1);
  const { opciones } = llamadas[0];
  assert.equal(opciones.method, 'POST');
  assert.equal(opciones.headers['x-api-key'], 'sk-ant-x');
  assert.equal(opciones.headers['anthropic-version'], '2023-06-01');

  const enviado = JSON.parse(opciones.body);
  assert.equal(enviado.model, MODELO);
  assert.equal(enviado.output_config.format.type, 'json_schema');
  assert.equal(enviado.messages[0].content, armarPrompt('P', PALABRAS));
});

test('devuelve la lectura que vino en el bloque de texto', async () => {
  const { buscar } = fetchFalso(conLectura('El curso está dividido en dos.'));
  const lectura = await crearLector({ clave: 'x', buscar }).leer('P', PALABRAS);

  assert.equal(lectura, 'El curso está dividido en dos.');
});

test('la lectura se recorta aunque el modelo se extienda', async () => {
  const { buscar } = fetchFalso(conLectura('palabra '.repeat(200)));
  const lectura = await crearLector({ clave: 'x', buscar }).leer('P', PALABRAS);

  assert.ok(lectura.length <= MAX_LECTURA);
});

test('un estado que no es 200 falla diciendo cuál fue', async () => {
  const { buscar } = fetchFalso({}, { ok: false, status: 429 });
  await assert.rejects(
    () => crearLector({ clave: 'x', buscar }).leer('P', PALABRAS),
    /429/,
  );
});

test('una negativa del clasificador se explica, no se rompe al parsear', async () => {
  const { buscar } = fetchFalso({ stop_reason: 'refusal', content: [] });
  await assert.rejects(
    () => crearLector({ clave: 'x', buscar }).leer('P', PALABRAS),
    /declinó/,
  );
});

test('una respuesta que no es JSON se explica', async () => {
  const { buscar } = fetchFalso({ content: [{ type: 'text', text: 'no soy json' }] });
  await assert.rejects(
    () => crearLector({ clave: 'x', buscar }).leer('P', PALABRAS),
    /no es JSON/,
  );
});

test('una lectura vacía se trata como fallo', async () => {
  const { buscar } = fetchFalso(conLectura('   '));
  await assert.rejects(
    () => crearLector({ clave: 'x', buscar }).leer('P', PALABRAS),
    /vacía/,
  );
});

test('sin bloque de texto se explica', async () => {
  const { buscar } = fetchFalso({ content: [{ type: 'thinking', thinking: '' }] });
  await assert.rejects(
    () => crearLector({ clave: 'x', buscar }).leer('P', PALABRAS),
    /no devolvió texto/,
  );
});

// --- lector falso ---------------------------------------------------------

test('el lector falso avisa que es de desarrollo y no llama a nadie', async () => {
  const lectura = await crearLectorFalso().leer('¿Qué recuerdan?', PALABRAS);

  assert.match(lectura, /desarrollo/);
  assert.ok(lectura.length <= MAX_LECTURA);
});
