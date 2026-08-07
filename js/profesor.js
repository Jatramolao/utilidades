/**
 * Pantalla del profesor (la que se proyecta).
 *
 * Regla que ordena el manejo de errores: nada puede dejar la pantalla en blanco
 * frente al curso. Si la red falla, se avisa en una esquina y se conserva la
 * última nube que se alcanzó a mostrar.
 */

import { comoSvg } from './qr.js';
import { crearNube } from './nube.js';

const $ = (id) => document.getElementById(id);

const INTERVALO = 2000;
const CLAVE_SALA = 'nube:sala';
const CLAVE_SALAS_HOY = 'nube:salas-hoy';
const VIDA_SALA_MS = 6 * 60 * 60 * 1000;

let sala = null; // { codigo, tokenProfesor }
let pregunta = null; // { n, texto, estado }
let sondeo = null;
let oculta = false;
let seleccionada = null;

const nube = crearNube($('nube'), { alSeleccionar: proponerEliminar });

// --- Acceso a la API ------------------------------------------------------

async function pedir(ruta, { metodo = 'GET', cuerpo } = {}) {
  const respuesta = await fetch(`/api${ruta}`, {
    method: metodo,
    headers: {
      ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
      ...(sala ? { 'x-token-profesor': sala.tokenProfesor } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const fallo = new Error(datos.error ?? 'No se pudo conectar');
    fallo.estado = respuesta.status;
    throw fallo;
  }
  return datos;
}

// --- Memoria local --------------------------------------------------------

function guardarSala() {
  localStorage.setItem(CLAVE_SALA, JSON.stringify(sala));
  const previas = leerSalasHoy().filter((s) => s.codigo !== sala.codigo);
  previas.unshift({ ...sala, creada: Date.now(), pregunta: pregunta?.texto ?? '' });
  localStorage.setItem(CLAVE_SALAS_HOY, JSON.stringify(previas.slice(0, 8)));
}

function leerSalasHoy() {
  try {
    const guardadas = JSON.parse(localStorage.getItem(CLAVE_SALAS_HOY) ?? '[]');
    return guardadas.filter((s) => Date.now() - s.creada < VIDA_SALA_MS);
  } catch {
    return [];
  }
}

function olvidarSala() {
  localStorage.removeItem(CLAVE_SALA);
  sala = null;
  pregunta = null;
}

// --- Pantallas ------------------------------------------------------------

function urlAlumno() {
  return `${location.origin}/r?s=${sala.codigo}`;
}

function pintarIngreso() {
  const svg = comoSvg(urlAlumno());
  $('qr-grande').innerHTML = svg;
  $('qr-chico').innerHTML = svg;
  $('codigo-grande').textContent = sala.codigo;
  $('codigo-chico').textContent = sala.codigo;
  $('url-grande').textContent = `${location.host}/r`;
  $('url-chica').textContent = `${location.host}/r`;
}

function mostrarInicio() {
  detenerSondeo();
  nube.limpiar();
  $('pantalla-sala').hidden = true;
  $('pantalla-inicio').hidden = false;
  pintarSalasHoy();
}

function pintarSalasHoy() {
  const salas = leerSalasHoy();
  $('salas-hoy').hidden = salas.length === 0;
  const lista = $('lista-salas');
  lista.replaceChildren();

  for (const guardada of salas) {
    const item = document.createElement('li');
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.innerHTML = `<code>${guardada.codigo}</code>`;
    const detalle = document.createElement('span');
    detalle.textContent = guardada.pregunta || 'Sin pregunta todavía';
    boton.append(detalle);
    boton.addEventListener('click', () => reanudar(guardada));
    item.append(boton);
    lista.append(item);
  }
}

function mostrarSala() {
  $('pantalla-inicio').hidden = true;
  $('pantalla-sala').hidden = false;
  pintarIngreso();
  pintarEstadoPregunta();
}

function pintarEstadoPregunta() {
  const hayPregunta = pregunta !== null;
  $('ingreso-grande').hidden = hayPregunta;
  $('ingreso-esquina').hidden = !hayPregunta;
  $('pregunta-actual').textContent = pregunta?.texto ?? '';
  $('btn-cerrar').hidden = !hayPregunta || pregunta.estado === 'cerrada';
  $('btn-ocultar').hidden = !hayPregunta;
  $('insignia-cerrada').hidden = !hayPregunta || pregunta.estado !== 'cerrada';
  if (!hayPregunta) {
    $('participantes').textContent = '';
    $('sin-respuestas').hidden = true;
    $('nube-oculta').hidden = true;
  }
}

// --- Acciones -------------------------------------------------------------

async function abrirSala() {
  $('error-inicio').hidden = true;
  $('btn-abrir').disabled = true;
  try {
    sala = await pedir('/sala', { metodo: 'POST' });
    pregunta = null;
    guardarSala();
    mostrarSala();
    abrirDialogoPregunta();
  } catch (fallo) {
    $('error-inicio').textContent = `No se pudo abrir la sala: ${fallo.message}`;
    $('error-inicio').hidden = false;
  } finally {
    $('btn-abrir').disabled = false;
  }
}

async function reanudar(guardada) {
  sala = { codigo: guardada.codigo, tokenProfesor: guardada.tokenProfesor };
  try {
    const estado = await pedir(`/sala/${sala.codigo}`);
    pregunta = estado.preguntaActiva
      ? { n: estado.preguntaActiva, texto: estado.texto, estado: estado.estado }
      : null;
    nube.limpiar();
    mostrarSala();
    if (pregunta) iniciarSondeo();
  } catch (fallo) {
    if (fallo.estado === 404) {
      // La sala venció: se limpia en vez de dejar un botón que no lleva a nada.
      localStorage.setItem(
        CLAVE_SALAS_HOY,
        JSON.stringify(leerSalasHoy().filter((s) => s.codigo !== guardada.codigo)),
      );
      olvidarSala();
      mostrarInicio();
      $('error-inicio').textContent = 'Esa sala ya venció. Abre una nueva.';
      $('error-inicio').hidden = false;
      return;
    }
    mostrarSala();
  }
}

async function lanzarPregunta(texto) {
  const respuesta = await pedir(`/sala/${sala.codigo}/pregunta`, {
    metodo: 'POST',
    cuerpo: { texto },
  });
  pregunta = { n: respuesta.n, texto: respuesta.texto, estado: 'abierta' };
  nube.limpiar();
  oculta = false;
  $('btn-ocultar').textContent = 'Ocultar nube';
  guardarSala();
  pintarEstadoPregunta();
  iniciarSondeo();
}

async function cerrarVotacion() {
  if (!pregunta) return;
  try {
    await pedir(`/sala/${sala.codigo}/pregunta/${pregunta.n}/cerrar`, { metodo: 'POST' });
    pregunta.estado = 'cerrada';
    pintarEstadoPregunta();
  } catch (fallo) {
    avisarRed(true, fallo.message);
  }
}

function proponerEliminar(palabra) {
  seleccionada = palabra;
  $('moderacion-texto').textContent = `¿Eliminar «${palabra.texto}»?`;
  $('moderacion').hidden = false;
}

async function eliminarSeleccionada() {
  if (!seleccionada || !pregunta) return;
  const clave = encodeURIComponent(seleccionada.clave);
  cancelarModeracion();
  try {
    await pedir(`/sala/${sala.codigo}/pregunta/${pregunta.n}/palabra/${clave}`, {
      metodo: 'DELETE',
    });
    await sondear();
  } catch (fallo) {
    avisarRed(true, fallo.message);
  }
}

function cancelarModeracion() {
  seleccionada = null;
  $('moderacion').hidden = true;
}

// --- Sondeo de la nube ----------------------------------------------------

function avisarRed(hayProblema, mensaje = 'Reconectando…') {
  $('estado-red').hidden = !hayProblema;
  $('estado-red').textContent = mensaje;
}

async function sondear() {
  if (!sala || !pregunta) return;
  try {
    const datos = await pedir(`/sala/${sala.codigo}/pregunta/${pregunta.n}/nube`);
    avisarRed(false);
    pintarNube(datos);
  } catch (fallo) {
    if (fallo.estado === 404) {
      // La sala venció mientras estaba abierta en pantalla.
      detenerSondeo();
      avisarRed(true, 'Esta sala venció');
      return;
    }
    // Cualquier otro fallo: se avisa, pero la nube que ya está en pantalla
    // se queda donde está.
    avisarRed(true);
  }
}

function pintarNube(datos) {
  pregunta.estado = datos.estado;
  pregunta.texto = datos.texto;
  $('pregunta-actual').textContent = datos.texto;
  $('participantes').textContent =
    datos.participantes === 1 ? '1 persona' : `${datos.participantes} personas`;
  $('oculta-participantes').textContent = datos.participantes;
  $('insignia-cerrada').hidden = datos.estado !== 'cerrada';
  $('btn-cerrar').hidden = datos.estado === 'cerrada';

  const sinRespuestas = datos.palabras.length === 0;
  $('sin-respuestas').hidden = !sinRespuestas || oculta;
  $('nube-oculta').hidden = !oculta;

  if (oculta) return;
  nube.actualizar(datos.palabras);
}

function iniciarSondeo() {
  detenerSondeo();
  sondear();
  sondeo = setInterval(sondear, INTERVALO);
}

function detenerSondeo() {
  if (sondeo) clearInterval(sondeo);
  sondeo = null;
}

// --- Diálogo de pregunta --------------------------------------------------

function abrirDialogoPregunta() {
  $('error-pregunta').hidden = true;
  $('texto-pregunta').value = '';
  $('velo-pregunta').hidden = false;
  // Corre el QR grande hacia abajo para que no quede debajo del diálogo:
  // mientras se escribe la pregunta, los alumnos ya deben poder escanear.
  document.body.classList.add('pidiendo');
  $('texto-pregunta').focus();
}

function cerrarDialogoPregunta() {
  $('velo-pregunta').hidden = true;
  document.body.classList.remove('pidiendo');
}

// --- Enganches ------------------------------------------------------------

$('btn-abrir').addEventListener('click', abrirSala);
$('btn-nueva').addEventListener('click', abrirDialogoPregunta);
$('btn-cancelar-pregunta').addEventListener('click', cerrarDialogoPregunta);
$('btn-cerrar').addEventListener('click', cerrarVotacion);
$('btn-eliminar').addEventListener('click', eliminarSeleccionada);
$('btn-cancelar-mod').addEventListener('click', cancelarModeracion);

$('btn-ocultar').addEventListener('click', () => {
  oculta = !oculta;
  $('btn-ocultar').textContent = oculta ? 'Mostrar nube' : 'Ocultar nube';
  $('nube-oculta').hidden = !oculta;
  if (!oculta) sondear();
  else $('sin-respuestas').hidden = true;
});

$('btn-salir').addEventListener('click', () => {
  detenerSondeo();
  olvidarSala();
  mostrarInicio();
});

$('form-pregunta').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const texto = $('texto-pregunta').value.trim();
  if (texto.length === 0) return;
  try {
    await lanzarPregunta(texto);
    cerrarDialogoPregunta();
  } catch (fallo) {
    $('error-pregunta').textContent = fallo.message;
    $('error-pregunta').hidden = false;
  }
});

document.addEventListener('keydown', (evento) => {
  if (evento.key !== 'Escape') return;
  cancelarModeracion();
  if (!$('velo-pregunta').hidden && pregunta) cerrarDialogoPregunta();
});

// La nube se redibuja al cambiar el tamaño de la ventana (pasa siempre al
// conectar el proyector).
let temporizadorTamano = null;
window.addEventListener('resize', () => {
  clearTimeout(temporizadorTamano);
  temporizadorTamano = setTimeout(() => {
    nube.limpiar();
    sondear();
  }, 250);
});

// Al cargar: si había una sala en curso, se reengancha sola. Un F5 accidental
// en medio de la clase no puede costar la sala.
(function arrancar() {
  pintarSalasHoy();
  try {
    const guardada = JSON.parse(localStorage.getItem(CLAVE_SALA) ?? 'null');
    if (guardada?.codigo && guardada?.tokenProfesor) {
      reanudar(guardada);
      return;
    }
  } catch {
    /* si el estado guardado está corrupto, se arranca limpio */
  }
  mostrarInicio();
})();
