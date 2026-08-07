import test from 'node:test';
import assert from 'node:assert/strict';
import { manejar, MAX_PALABRAS, TTL } from '../api/_lib/rutas.js';
import { crearStoreMemoria } from '../api/_lib/store-memoria.js';
import { esCodigoValido } from '../js/codigo.js';

function crearCliente(opciones = {}) {
  const store = crearStoreMemoria(opciones);
  const llamar = (metodo, ruta, { cuerpo, ip, tokenProfesor, consulta } = {}) =>
    manejar(
      {
        metodo,
        segmentos: ruta.split('/').filter(Boolean),
        cuerpo,
        consulta: consulta ?? {},
        ip,
        tokenProfesor,
      },
      store,
    );
  return { store, llamar };
}

async function salaConPregunta(cliente, texto = '¿Qué recuerdas de la clase?') {
  const creada = await cliente.llamar('POST', 'sala');
  const { codigo, tokenProfesor } = creada.cuerpo;
  const pregunta = await cliente.llamar('POST', `sala/${codigo}/pregunta`, {
    cuerpo: { texto },
    tokenProfesor,
  });
  return { codigo, tokenProfesor, n: pregunta.cuerpo.n };
}

const enviar = (cliente, codigo, token, palabras) =>
  cliente.llamar('POST', `sala/${codigo}/palabras`, {
    cuerpo: { token, palabras },
  });

// --- Crear sala -----------------------------------------------------------

test('crear sala devuelve un código válido y un token de profesor', async () => {
  const cliente = crearCliente();
  const { estado, cuerpo } = await cliente.llamar('POST', 'sala');

  assert.equal(estado, 200);
  assert.ok(esCodigoValido(cuerpo.codigo));
  assert.ok(cuerpo.tokenProfesor.length >= 16);
  assert.equal(cuerpo.ttlSegundos, TTL);
});

test('el token de profesor nunca se filtra por la ruta pública', async () => {
  const cliente = crearCliente();
  const { codigo } = (await cliente.llamar('POST', 'sala')).cuerpo;

  const publico = await cliente.llamar('GET', `sala/${codigo}`);
  assert.equal(
    JSON.stringify(publico.cuerpo).includes('tokenProfesor'),
    false,
    'un alumno con el código no puede llegar al token de control',
  );
});

test('las salas conviven sin interferirse', async () => {
  const cliente = crearCliente();
  const a = await salaConPregunta(cliente, 'Pregunta del curso de las 10:00');
  const b = await salaConPregunta(cliente, 'Pregunta del curso de las 11:40');

  assert.notEqual(a.codigo, b.codigo);
  await enviar(cliente, a.codigo, 'dispositivo-a', ['apertura']);

  const nubeB = await cliente.llamar('GET', `sala/${b.codigo}/pregunta/1/nube`);
  assert.deepEqual(nubeB.cuerpo.palabras, []);
});

// --- Control del profesor -------------------------------------------------

test('lanzar una pregunta sin el token del profesor se rechaza', async () => {
  const cliente = crearCliente();
  const { codigo } = (await cliente.llamar('POST', 'sala')).cuerpo;

  const sinToken = await cliente.llamar('POST', `sala/${codigo}/pregunta`, {
    cuerpo: { texto: 'Una pregunta' },
  });
  assert.equal(sinToken.estado, 403);

  const tokenAjeno = await cliente.llamar('POST', `sala/${codigo}/pregunta`, {
    cuerpo: { texto: 'Una pregunta' },
    tokenProfesor: 'el-token-de-un-alumno-curioso',
  });
  assert.equal(tokenAjeno.estado, 403);
});

test('cerrar la votación sin token se rechaza', async () => {
  const cliente = crearCliente();
  const { codigo, n } = await salaConPregunta(cliente);

  const intento = await cliente.llamar(
    'POST',
    `sala/${codigo}/pregunta/${n}/cerrar`,
    { tokenProfesor: 'no-soy-el-profesor' },
  );
  assert.equal(intento.estado, 403);
});

test('lanzar la pregunta siguiente cierra la anterior', async () => {
  const cliente = crearCliente();
  const { codigo, tokenProfesor } = await salaConPregunta(cliente, 'Primera');

  await cliente.llamar('POST', `sala/${codigo}/pregunta`, {
    cuerpo: { texto: 'Segunda' },
    tokenProfesor,
  });

  const primera = await cliente.llamar('GET', `sala/${codigo}/pregunta/1/nube`);
  assert.equal(primera.cuerpo.estado, 'cerrada');

  const activa = await cliente.llamar('GET', `sala/${codigo}`);
  assert.equal(activa.cuerpo.preguntaActiva, 2);
  assert.equal(activa.cuerpo.texto, 'Segunda');
});

test('el código y la sala no cambian al lanzar más preguntas', async () => {
  const cliente = crearCliente();
  const { codigo, tokenProfesor } = await salaConPregunta(cliente, 'Primera');

  const segunda = await cliente.llamar('POST', `sala/${codigo}/pregunta`, {
    cuerpo: { texto: 'Segunda' },
    tokenProfesor,
  });
  assert.equal(segunda.estado, 200);
  assert.equal(segunda.cuerpo.n, 2);

  const estado = await cliente.llamar('GET', `sala/${codigo}`);
  assert.equal(estado.cuerpo.codigo, codigo);
});

test('la pregunta no puede ir vacía ni ser interminable', async () => {
  const cliente = crearCliente();
  const { codigo, tokenProfesor } = (await cliente.llamar('POST', 'sala')).cuerpo;

  const vacia = await cliente.llamar('POST', `sala/${codigo}/pregunta`, {
    cuerpo: { texto: '   ' },
    tokenProfesor,
  });
  assert.equal(vacia.estado, 400);

  const eterna = await cliente.llamar('POST', `sala/${codigo}/pregunta`, {
    cuerpo: { texto: 'a'.repeat(500) },
    tokenProfesor,
  });
  assert.equal(eterna.estado, 400);
});

// --- Envío de palabras ----------------------------------------------------

test('un alumno puede enviar hasta el máximo de palabras y no más', async () => {
  const cliente = crearCliente();
  const { codigo } = await salaConPregunta(cliente);

  const primero = await enviar(cliente, codigo, 'dispositivo-1', [
    'apertura',
    'iso',
    'obturador',
  ]);
  assert.equal(primero.estado, 200);
  assert.equal(primero.cuerpo.aceptadas, MAX_PALABRAS);

  const segundo = await enviar(cliente, codigo, 'dispositivo-1', ['encuadre']);
  assert.equal(segundo.estado, 409);
});

test('un envío con más palabras del tope solo cuenta las que caben', async () => {
  const cliente = crearCliente();
  const { codigo } = await salaConPregunta(cliente);

  const respuesta = await enviar(cliente, codigo, 'dispositivo-1', [
    'uno',
    'dos',
    'tres',
    'cuatro',
    'cinco',
  ]);
  assert.equal(respuesta.cuerpo.aceptadas, MAX_PALABRAS);

  const nube = await cliente.llamar('GET', `sala/${codigo}/pregunta/1/nube`);
  assert.equal(nube.cuerpo.palabras.length, MAX_PALABRAS);
});

test('el mismo alumno no puede inflar una palabra repitiéndola', async () => {
  const cliente = crearCliente();
  const { codigo } = await salaConPregunta(cliente);

  await enviar(cliente, codigo, 'dispositivo-1', ['luz', 'Luz', 'LUZ']);

  const nube = await cliente.llamar('GET', `sala/${codigo}/pregunta/1/nube`);
  assert.equal(nube.cuerpo.palabras.length, 1);
  assert.equal(nube.cuerpo.palabras[0].conteo, 1);
});

test('palabras inválidas se descartan en silencio', async () => {
  const cliente = crearCliente();
  const { codigo } = await salaConPregunta(cliente);

  const respuesta = await enviar(cliente, codigo, 'dispositivo-1', [
    '',
    '   ',
    '...',
    'encuadre',
  ]);
  assert.equal(respuesta.estado, 200);
  assert.equal(respuesta.cuerpo.aceptadas, 1);
});

test('un identificador de dispositivo ausente o basura se rechaza', async () => {
  const cliente = crearCliente();
  const { codigo } = await salaConPregunta(cliente);

  assert.equal((await enviar(cliente, codigo, '', ['luz'])).estado, 400);
  assert.equal((await enviar(cliente, codigo, 'corto', ['luz'])).estado, 400);
});

test('no se puede enviar antes de que haya pregunta activa', async () => {
  const cliente = crearCliente();
  const { codigo } = (await cliente.llamar('POST', 'sala')).cuerpo;

  const respuesta = await enviar(cliente, codigo, 'dispositivo-1', ['luz']);
  assert.equal(respuesta.estado, 409);
});

test('con la votación cerrada ya no se reciben palabras', async () => {
  const cliente = crearCliente();
  const { codigo, tokenProfesor, n } = await salaConPregunta(cliente);

  await cliente.llamar('POST', `sala/${codigo}/pregunta/${n}/cerrar`, {
    tokenProfesor,
  });

  const respuesta = await enviar(cliente, codigo, 'dispositivo-1', ['luz']);
  assert.equal(respuesta.estado, 409);
});

test('la cuota se reinicia con cada pregunta nueva', async () => {
  const cliente = crearCliente();
  const { codigo, tokenProfesor } = await salaConPregunta(cliente, 'Primera');

  await enviar(cliente, codigo, 'dispositivo-1', ['a', 'b', 'c']);
  await cliente.llamar('POST', `sala/${codigo}/pregunta`, {
    cuerpo: { texto: 'Segunda' },
    tokenProfesor,
  });

  const respuesta = await enviar(cliente, codigo, 'dispositivo-1', ['d']);
  assert.equal(respuesta.estado, 200);
  assert.equal(respuesta.cuerpo.aceptadas, 1);
});

// --- La nube --------------------------------------------------------------

test('agrupa las variantes y suma el conteo', async () => {
  const cliente = crearCliente();
  const { codigo } = await salaConPregunta(cliente);

  await enviar(cliente, codigo, 'dispositivo-1', ['Apertura']);
  await enviar(cliente, codigo, 'dispositivo-2', ['apertura']);
  await enviar(cliente, codigo, 'dispositivo-3', ['apertura.']);

  const nube = await cliente.llamar('GET', `sala/${codigo}/pregunta/1/nube`);
  assert.equal(nube.cuerpo.palabras.length, 1);
  assert.equal(nube.cuerpo.palabras[0].conteo, 3);
});

test('muestra la forma que más alumnos escribieron', async () => {
  const cliente = crearCliente();
  const { codigo } = await salaConPregunta(cliente);

  await enviar(cliente, codigo, 'dispositivo-1', ['Fotografía']);
  await enviar(cliente, codigo, 'dispositivo-2', ['fotografia']);
  await enviar(cliente, codigo, 'dispositivo-3', ['Fotografía']);

  const nube = await cliente.llamar('GET', `sala/${codigo}/pregunta/1/nube`);
  assert.equal(nube.cuerpo.palabras[0].texto, 'Fotografía');
});

test('las palabras vienen ordenadas de mayor a menor', async () => {
  const cliente = crearCliente();
  const { codigo } = await salaConPregunta(cliente);

  await enviar(cliente, codigo, 'dispositivo-1', ['luz', 'sombra']);
  await enviar(cliente, codigo, 'dispositivo-2', ['luz']);
  await enviar(cliente, codigo, 'dispositivo-3', ['luz']);

  const nube = await cliente.llamar('GET', `sala/${codigo}/pregunta/1/nube`);
  assert.deepEqual(
    nube.cuerpo.palabras.map((p) => p.conteo),
    [3, 1],
  );
});

test('cuenta participantes, no palabras', async () => {
  const cliente = crearCliente();
  const { codigo } = await salaConPregunta(cliente);

  await enviar(cliente, codigo, 'dispositivo-1', ['a', 'b', 'c']);
  await enviar(cliente, codigo, 'dispositivo-2', ['d']);

  const nube = await cliente.llamar('GET', `sala/${codigo}/pregunta/1/nube`);
  assert.equal(nube.cuerpo.participantes, 2);
});

// --- Moderación -----------------------------------------------------------

test('eliminar una palabra exige el token del profesor', async () => {
  const cliente = crearCliente();
  const { codigo } = await salaConPregunta(cliente);
  await enviar(cliente, codigo, 'dispositivo-1', ['inapropiada']);

  const intento = await cliente.llamar(
    'DELETE',
    `sala/${codigo}/pregunta/1/palabra/inapropiada`,
    { tokenProfesor: 'no-soy-el-profesor' },
  );
  assert.equal(intento.estado, 403);
});

test('la palabra eliminada desaparece de la nube y no vuelve con su grafía vieja', async () => {
  const cliente = crearCliente();
  const { codigo, tokenProfesor } = await salaConPregunta(cliente);
  await enviar(cliente, codigo, 'dispositivo-1', ['Grosería', 'luz']);

  await cliente.llamar(
    'DELETE',
    `sala/${codigo}/pregunta/1/palabra/${encodeURIComponent('groseria')}`,
    { tokenProfesor },
  );

  const nube = await cliente.llamar('GET', `sala/${codigo}/pregunta/1/nube`);
  assert.deepEqual(
    nube.cuerpo.palabras.map((p) => p.clave),
    ['luz'],
  );
});

// --- Vencimiento y errores ------------------------------------------------

test('una sala vencida responde que ya no existe', async () => {
  let reloj = 1_000_000;
  const cliente = crearCliente({ ahora: () => reloj });
  const { codigo } = await salaConPregunta(cliente);

  reloj += (TTL + 1) * 1000;

  assert.equal((await cliente.llamar('GET', `sala/${codigo}`)).estado, 404);
  assert.equal((await enviar(cliente, codigo, 'dispositivo-1', ['luz'])).estado, 404);
});

test('cada escritura renueva el vencimiento, para que una clase larga no muera a mitad', async () => {
  let reloj = 1_000_000;
  const cliente = crearCliente({ ahora: () => reloj });
  const { codigo } = await salaConPregunta(cliente);

  // Cinco horas de clase, con actividad cada hora.
  for (let hora = 0; hora < 5; hora++) {
    reloj += 60 * 60 * 1000;
    const respuesta = await enviar(cliente, codigo, `dispositivo-${hora}`, ['luz']);
    assert.equal(respuesta.estado, 200, `debería seguir viva en la hora ${hora + 1}`);
  }
});

test('un código inexistente o mal escrito no revienta', async () => {
  const cliente = crearCliente();

  assert.equal((await cliente.llamar('GET', 'sala/ZZZZ')).estado, 404);
  assert.equal((await cliente.llamar('GET', 'sala/nope')).estado, 400);
  assert.equal((await cliente.llamar('GET', 'sala/ABOD')).estado, 400);
});

test('el código se acepta en minúsculas y con espacios', async () => {
  const cliente = crearCliente();
  const { codigo } = await salaConPregunta(cliente);

  const respuesta = await cliente.llamar('GET', `sala/ ${codigo.toLowerCase()} `);
  assert.equal(respuesta.estado, 200);
});

test('el tope por IP frena el envío masivo', async () => {
  const cliente = crearCliente();
  const { codigo } = await salaConPregunta(cliente);

  let bloqueado = false;
  for (let i = 0; i < 30; i++) {
    const respuesta = await cliente.llamar('POST', `sala/${codigo}/palabras`, {
      cuerpo: { token: `dispositivo-${i}`, palabras: ['luz'] },
      ip: '10.0.0.1',
    });
    if (respuesta.estado === 429) {
      bloqueado = true;
      break;
    }
  }
  assert.ok(bloqueado, 'la misma IP debería quedar frenada antes de 30 envíos');
});

test('métodos y rutas desconocidas responden con claridad', async () => {
  const cliente = crearCliente();
  const { codigo } = await salaConPregunta(cliente);

  assert.equal((await cliente.llamar('GET', 'sala')).estado, 405);
  assert.equal((await cliente.llamar('PUT', `sala/${codigo}`)).estado, 405);
  assert.equal((await cliente.llamar('GET', 'otra/cosa')).estado, 404);
  assert.equal((await cliente.llamar('GET', `sala/${codigo}/pregunta/0/nube`)).estado, 400);
});
