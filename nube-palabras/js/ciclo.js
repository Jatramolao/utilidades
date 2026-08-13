/**
 * Ciclo de prueba del lanzamiento de preguntas.
 *
 * Maneja la pantalla real del profesor dentro de un iframe y comprueba el
 * recorrido completo: abrir sala → lanzar → responder → ocultar → cerrar →
 * lanzar la siguiente.
 *
 * La comprobación que importa aquí no es "¿el elemento tiene hidden=false?"
 * sino **"¿se ve de verdad?"**. El bug que motivó este ciclo era justamente
 * eso: el QR de esquina tenía hidden=false y estaba correctamente colocado,
 * pero un panel opaco posterior en el DOM lo pintaba encima. Por eso cada
 * comprobación de visibilidad usa `elementFromPoint`: pregunta quién pinta
 * realmente en ese punto de la pantalla.
 */

const marco = document.getElementById('marco');
const salida = document.getElementById('salida');
const resumen = document.getElementById('resumen');

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const CICLO_SONDEO = 2600; // un poco más que el intervalo del proyector

let pasadas = 0;
let fallidas = 0;

function anotar(ok, titulo, detalle = '') {
  if (ok) pasadas++;
  else fallidas++;
  const fila = document.createElement('li');
  fila.className = ok ? 'ok' : 'mal';
  fila.innerHTML = `<strong>${ok ? 'PASA' : 'FALLA'}</strong> ${titulo}`;
  if (detalle) {
    const nota = document.createElement('span');
    nota.textContent = ` — ${detalle}`;
    fila.append(nota);
  }
  salida.append(fila);
}

// --- Utilidades sobre el iframe -------------------------------------------

const doc = () => marco.contentDocument;
const ven = () => marco.contentWindow;
const $ = (id) => doc().getElementById(id);

const declaradoVisible = (id) => !$(id).hidden;

/**
 * ¿Quién pinta en el centro de este elemento? Devuelve null si el elemento
 * es realmente el que se ve; si no, el descriptor de quien lo tapa.
 */
function loTapa(id) {
  const el = $(id);
  if (el.hidden) return 'está oculto por HTML';
  const caja = el.getBoundingClientRect();
  if (caja.width === 0 || caja.height === 0) return 'no ocupa espacio';
  const encima = doc().elementFromPoint(caja.x + caja.width / 2, caja.y + caja.height / 2);
  if (!encima) return 'no hay nada en ese punto';
  if (encima.closest(`#${id}`)) return null;
  return `lo tapa #${encima.id || encima.className || encima.tagName}`;
}

function seVeDeVerdad(titulo, id) {
  const problema = loTapa(id);
  anotar(problema === null, titulo, problema ?? '');
}

function noSeVe(titulo, id) {
  anotar($(id).hidden, titulo, $(id).hidden ? '' : 'sigue visible');
}

const textoDePalabra = (clave) =>
  doc().querySelector(`.palabra[data-clave="${clave}"]`)?.textContent ?? null;

/** Amplitud de la respiración en nube.js. Si cambia allí, cambia aquí. */
const AMPLITUD_RESPIRACION = 3;

const CONTRASTE_MINIMO = 4.5;

function canalLineal(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminancia(rgb) {
  const [r, g, b] = rgb.match(/\d+/g).map(Number);
  return 0.2126 * canalLineal(r) + 0.7152 * canalLineal(g) + 0.0722 * canalLineal(b);
}

function razonDeContraste(colorA, colorB) {
  const a = luminancia(colorA);
  const b = luminancia(colorB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Toda palabra tiene que despegarse del fondo. Se comprueba **inmediatamente**
 * después de cambiar de tema, sin esperar sondeos: el fallo que motivó esta
 * comprobación era que el fondo se oscurecía al instante y los colores de las
 * palabras esperaban al siguiente viaje a la red, dejando texto oscuro sobre
 * fondo oscuro durante ese hueco.
 */
function comprobarContraste(titulo) {
  const fondo = ven().getComputedStyle(doc().body).backgroundColor;
  const flojas = [...doc().querySelectorAll('.palabra:not(.palabra--regla)')]
    .map((el) => ({ texto: el.textContent, razon: razonDeContraste(ven().getComputedStyle(el).color, fondo) }))
    .filter((p) => p.razon < CONTRASTE_MINIMO);

  anotar(
    flojas.length === 0,
    titulo,
    flojas.map((p) => `${p.texto} ${p.razon.toFixed(2)}:1`).slice(0, 4).join(', '),
  );
}

/**
 * Ninguna palabra puede encimarse con otra. Es el invariante del layout y no
 * se puede comprobar leyendo el estado interno: hay que medir las cajas que
 * realmente quedaron en pantalla.
 *
 * Cada caja se infla por la amplitud de la respiración antes de comparar. Una
 * medición suelta solo ve un instante del ciclo de oscilación; inflarla
 * comprueba que **en ningún momento** del ciclo se tocan, que es el invariante
 * de verdad.
 */
function comprobarSinSolapes(titulo) {
  const m = AMPLITUD_RESPIRACION;
  const cajas = [...doc().querySelectorAll('.palabra:not(.palabra--regla)')].map((el) => {
    const c = el.getBoundingClientRect();
    return {
      texto: el.textContent,
      izq: c.left - m,
      der: c.right + m,
      arr: c.top - m,
      aba: c.bottom + m,
    };
  });

  const choques = [];
  for (let i = 0; i < cajas.length; i++) {
    for (let j = i + 1; j < cajas.length; j++) {
      const a = cajas[i];
      const b = cajas[j];
      if (a.izq < b.der && b.izq < a.der && a.arr < b.aba && b.arr < a.aba) {
        choques.push(`${a.texto}↔${b.texto}`);
      }
    }
  }
  anotar(choques.length === 0, titulo, choques.slice(0, 4).join(', '));
}

const codigoDeLaSala = () => JSON.parse(ven().localStorage.getItem('nube:sala')).codigo;

async function responder(codigo, token, palabras) {
  await fetch(`/api/sala/${codigo}/palabras`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, palabras }),
  });
}

function cargarMarco() {
  return new Promise((listo) => {
    marco.addEventListener('load', () => listo(), { once: true });
    marco.src = '/';
  });
}

// --- El ciclo -------------------------------------------------------------

async function correr() {
  salida.replaceChildren();
  pasadas = 0;
  fallidas = 0;
  resumen.textContent = 'Corriendo…';
  resumen.className = '';

  // Arranque limpio: sin salas guardadas de una corrida anterior.
  await cargarMarco();
  ven().localStorage.clear();
  await cargarMarco();
  await esperar(400);

  anotar(declaradoVisible('pantalla-inicio'), 'Arranca en la pantalla de inicio');

  // --- 1. Abrir sala ------------------------------------------------------
  $('btn-abrir').click();
  await esperar(900);

  anotar(declaradoVisible('pantalla-sala'), 'Al abrir sala se pasa a la pantalla de sala');
  anotar(declaradoVisible('velo-pregunta'), 'Se pide la pregunta de inmediato');
  seVeDeVerdad('El QR grande se ve mientras se escribe la pregunta', 'qr-grande');

  const codigo = codigoDeLaSala();
  anotar(/^[A-Z]{4}$/.test(codigo), `El código de sala es legible: ${codigo}`);

  // --- 2. Lanzar la primera pregunta --------------------------------------
  $('texto-pregunta').value = '¿Qué es lo más difícil de un buen encuadre?';
  $('form-pregunta').requestSubmit();
  await esperar(1200);

  anotar(!declaradoVisible('velo-pregunta'), 'El diálogo se cierra al lanzar');
  anotar(
    $('pregunta-actual').textContent.includes('encuadre'),
    'La pregunta queda en la barra superior',
  );
  noSeVe('El QR grande se retira del centro', 'ingreso-grande');
  seVeDeVerdad(
    'El QR pasa a la esquina y SE VE (nadie puede entrar si está tapado)',
    'qr-chico',
  );
  anotar(declaradoVisible('sin-respuestas'), 'Se avisa que no hay respuestas todavía');

  // --- 3. Responder -------------------------------------------------------
  await responder(codigo, 'ciclo-alumno-1', ['luz', 'fondo']);
  await responder(codigo, 'ciclo-alumno-2', ['luz']);
  await esperar(CICLO_SONDEO);

  const palabras = [...doc().querySelectorAll('.palabra:not(.palabra--regla)')].map((e) => e.textContent);
  anotar(palabras.includes('luz') && palabras.includes('fondo'), 'Las palabras llegan a la nube', palabras.join(', '));
  comprobarSinSolapes('Ninguna palabra se encima con otra');
  noSeVe('El aviso de "sin respuestas" se retira', 'sin-respuestas');
  seVeDeVerdad('El QR de esquina sigue a la vista con la nube llena', 'qr-chico');

  // --- 3a. Ampliar el QR para el que llega tarde --------------------------
  $('ingreso-esquina').click();
  await esperar(400);
  seVeDeVerdad('Al pulsar la esquina, el QR se ve en grande', 'qr-grande');
  anotar($('ingreso-esquina').hidden, 'La tarjeta de la esquina se retira mientras está ampliado');
  anotar(
    $('ingreso-grande').classList.contains('ingreso--ampliado'),
    'La vista grande se marca como ampliada',
  );

  $('ingreso-grande').click();
  await esperar(400);
  seVeDeVerdad('Al pulsar de nuevo, el QR vuelve a la esquina', 'qr-chico');
  anotar($('ingreso-grande').hidden, 'La vista grande se retira al volver');
  anotar(
    doc().querySelectorAll('.palabra:not(.palabra--regla)').length > 0,
    'La nube sigue ahí después de ampliar y volver',
  );

  // Y con Esc, que es lo que uno aprieta sin pensar.
  $('ingreso-esquina').click();
  await esperar(300);
  doc().dispatchEvent(new (ven().KeyboardEvent)('keydown', { key: 'Escape', bubbles: true }));
  await esperar(400);
  seVeDeVerdad('Esc también devuelve el QR a la esquina', 'qr-chico');

  // --- 3b. La grafía mostrada se corrige sola -----------------------------
  // Se muestra la forma que más alumnos escribieron, así que puede cambiar con
  // cada voto nuevo. En producción quedaba fija la primera que llegó, porque el
  // elemento ya puesto nunca actualizaba su texto.
  await responder(codigo, 'ciclo-grafia-1', ['composicion']);
  await esperar(CICLO_SONDEO);
  const grafiaInicial = textoDePalabra('composicion');

  await responder(codigo, 'ciclo-grafia-2', ['Composición']);
  await responder(codigo, 'ciclo-grafia-3', ['Composición']);
  await esperar(CICLO_SONDEO);

  anotar(
    textoDePalabra('composicion') === 'Composición',
    'La grafía en pantalla se corrige cuando cambia la forma mayoritaria',
    `empezó "${grafiaInicial}" y quedó "${textoDePalabra('composicion')}"`,
  );
  comprobarSinSolapes('Ninguna palabra se encima con otra tras cambiar de grafía');

  // --- 4. Ocultar la nube -------------------------------------------------
  $('btn-ocultar').click();
  await esperar(400);

  anotar(declaradoVisible('nube-oculta'), 'Ocultar la nube muestra el contador');
  seVeDeVerdad(
    'Con la nube oculta el QR sigue a la vista (el que llega tarde debe poder entrar)',
    'qr-chico',
  );

  $('btn-ocultar').click();
  await esperar(CICLO_SONDEO);
  anotar(doc().querySelectorAll('.palabra:not(.palabra--regla)').length > 0, 'Mostrar la nube la devuelve');

  // --- 5. Cerrar la votación ----------------------------------------------
  $('btn-cerrar').click();
  await esperar(900);

  anotar(declaradoVisible('insignia-cerrada'), 'Se marca la votación como cerrada');
  anotar($('btn-cerrar').hidden, 'El botón de cerrar desaparece una vez cerrada');
  anotar(doc().querySelectorAll('.palabra:not(.palabra--regla)').length > 0, 'La nube queda congelada, no se borra');
  seVeDeVerdad('El QR sigue a la vista con la votación cerrada', 'qr-chico');

  // --- 5b. Panel de conteos ------------------------------------------------
  await esperar(CICLO_SONDEO);
  anotar(declaradoVisible('conteos'), 'Al cerrar la votación aparecen los conteos');
  seVeDeVerdad('El panel de conteos se ve de verdad', 'conteos');

  // Las dos tarjetas de la franja inferior no pueden pisarse a ningún ancho.
  // Pasó en producción y no en local, porque dependía del tamaño de la ventana.
  const cajaConteos = $('conteos').getBoundingClientRect();
  const cajaQr = $('ingreso-esquina').getBoundingClientRect();
  anotar(
    cajaConteos.right <= cajaQr.left + 1 || cajaQr.right <= cajaConteos.left + 1,
    'El panel de conteos y el QR no se pisan',
    `conteos ${Math.round(cajaConteos.left)}-${Math.round(cajaConteos.right)}, QR ${Math.round(cajaQr.left)}-${Math.round(cajaQr.right)}`,
  );

  const filas = [...doc().querySelectorAll('#conteos-lista li')].map((li) => ({
    texto: li.querySelector('span').textContent,
    numero: Number(li.querySelector('b').textContent),
  }));
  anotar(filas.length > 0, 'El panel lista palabras', filas.map((f) => `${f.texto}=${f.numero}`).join(', '));

  const datosNube = await (
    await fetch(`/api/sala/${codigo}/pregunta/1/nube`)
  ).json();
  const esperadas = datosNube.palabras.slice(0, filas.length);
  anotar(
    filas.every((f, i) => f.texto === esperadas[i].texto && f.numero === esperadas[i].conteo),
    'Los números del panel coinciden con los de la API',
  );
  anotar(
    filas.every((f, i) => i === 0 || f.numero <= filas[i - 1].numero),
    'El panel va de mayor a menor',
  );

  // Con la nube oculta, los números también: enseñarlos anularía lo que ese
  // botón protege.
  $('btn-ocultar').click();
  await esperar(500);
  anotar($('conteos').hidden, 'Al ocultar la nube, el panel de conteos se esconde también');
  $('btn-ocultar').click();
  await esperar(CICLO_SONDEO);

  // --- 5c. Modo nocturno ---------------------------------------------------
  const fondoClaro = ven().getComputedStyle(doc().body).backgroundColor;
  comprobarContraste('Las palabras contrastan con el fondo en modo diurno');

  $('btn-tema').click();
  // Sin esperar nada: el repintado tiene que ser inmediato, no depender de red.
  comprobarContraste('Al cambiar de tema, las palabras contrastan de inmediato');
  await esperar(500);

  const fondoOscuro = ven().getComputedStyle(doc().body).backgroundColor;
  anotar(fondoOscuro !== fondoClaro, 'El modo nocturno cambia el fondo', `${fondoClaro} → ${fondoOscuro}`);
  anotar(
    doc().documentElement.dataset.tema === 'oscuro',
    'El tema queda marcado en el documento',
  );

  // Un QR claro sobre fondo oscuro es poco fiable para muchas cámaras, y es la
  // única puerta de entrada a la sala.
  const fondoQr = ven().getComputedStyle($('ingreso-esquina')).backgroundColor;
  anotar(
    fondoQr === 'rgb(255, 255, 255)',
    'En modo nocturno la tarjeta del QR sigue clara',
    fondoQr,
  );
  seVeDeVerdad('El QR se sigue viendo en modo nocturno', 'qr-chico');
  comprobarSinSolapes('Ninguna palabra se encima en modo nocturno');

  anotar(
    ven().localStorage.getItem('nube:tema') === 'oscuro',
    'El tema se recuerda en el navegador',
  );

  $('btn-tema').click();
  await esperar(400);
  anotar(
    doc().documentElement.dataset.tema === 'claro',
    'Se puede volver al modo diurno',
  );

  // --- 6. Lanzar la segunda pregunta en la misma sala ---------------------
  $('btn-nueva').click();
  await esperar(300);
  seVeDeVerdad('El QR se ve mientras se escribe la segunda pregunta', 'qr-chico');

  $('texto-pregunta').value = '¿Con qué palabra te quedas de hoy?';
  $('form-pregunta').requestSubmit();
  await esperar(1200);

  anotar(codigoDeLaSala() === codigo, 'El código de sala NO cambia entre preguntas', codigoDeLaSala());
  anotar(
    !$('ingreso-grande').classList.contains('ingreso--ampliado'),
    'Al lanzar una pregunta nueva el QR vuelve solo a la esquina',
  );
  anotar(doc().querySelectorAll('.palabra:not(.palabra--regla)').length === 0, 'La nube arranca vacía en la pregunta nueva');
  anotar(!declaradoVisible('insignia-cerrada'), 'La marca de "cerrada" se apaga');
  seVeDeVerdad('El QR sigue a la vista tras lanzar la segunda pregunta', 'qr-chico');

  // --- 7. La cuota se renueva con la pregunta nueva ------------------------
  await responder(codigo, 'ciclo-alumno-1', ['exposición']);
  await esperar(CICLO_SONDEO);
  const segundas = [...doc().querySelectorAll('.palabra:not(.palabra--regla)')].map((e) => e.textContent);
  anotar(
    segundas.includes('exposición'),
    'Un alumno que ya respondió la pregunta 1 puede responder la 2',
    segundas.join(', '),
  );

  // --- Resumen ------------------------------------------------------------
  resumen.textContent = `${pasadas} pasan · ${fallidas} fallan`;
  resumen.className = fallidas === 0 ? 'ok' : 'mal';
}

document.getElementById('btn-correr').addEventListener('click', () => {
  correr().catch((fallo) => {
    anotar(false, 'El ciclo se cayó', fallo.message);
    resumen.textContent = `${pasadas} pasan · ${fallidas} fallan`;
    resumen.className = 'mal';
  });
});
