/**
 * Pantalla del alumno (el teléfono).
 *
 * No sondea al servidor de fondo: escribe una vez y se detiene. Cuando el
 * profesor lanza la pregunta siguiente, el alumno toca "Ver pregunta actual".
 * Esa decisión es la que mantiene el costo del servicio en nada aunque haya
 * 40 teléfonos en la sala.
 */

import { esPalabraValida } from './normalizar.js';
import { normalizarCodigo, esCodigoValido } from './codigo.js';

const $ = (id) => document.getElementById(id);
const CLAVE_DISPOSITIVO = 'nube:dispositivo';

let codigo = null;
let config = { maxPalabras: 3, maxLargo: 30 };

/**
 * Identificador aleatorio del teléfono. No dice nada de quién es: solo sirve
 * para el tope de palabras por dispositivo, y nunca se cruza con lo que se
 * escribió.
 */
function identificador() {
  let guardado = localStorage.getItem(CLAVE_DISPOSITIVO);
  if (!guardado) {
    guardado = crypto.randomUUID().replaceAll('-', '');
    localStorage.setItem(CLAVE_DISPOSITIVO, guardado);
  }
  return guardado;
}

async function pedir(ruta, { metodo = 'GET', cuerpo } = {}) {
  const respuesta = await fetch(`/api${ruta}`, {
    method: metodo,
    headers: cuerpo ? { 'Content-Type': 'application/json' } : {},
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

// --- Pintado --------------------------------------------------------------

function ocultarTodo() {
  for (const id of ['cargando', 'error', 'espera', 'bloque-pregunta', 'listo', 'btn-actualizar']) {
    $(id).hidden = true;
  }
}

function mostrarError(mensaje, { conActualizar = true } = {}) {
  ocultarTodo();
  $('error').textContent = mensaje;
  $('error').hidden = false;
  $('btn-actualizar').hidden = !conActualizar;
}

function mostrarListo(mensaje) {
  ocultarTodo();
  $('listo').textContent = mensaje;
  $('listo').hidden = false;
  $('btn-actualizar').hidden = false;
}

function mostrarEspera() {
  ocultarTodo();
  $('espera').hidden = false;
  $('btn-actualizar').hidden = false;
}

function pintarCampos(cantidad) {
  const contenedor = $('campos');
  contenedor.replaceChildren();
  for (let i = 0; i < cantidad; i++) {
    const etiqueta = document.createElement('label');
    etiqueta.setAttribute('for', `palabra-${i}`);
    etiqueta.textContent = `Palabra ${i + 1}${i === 0 ? '' : ' (opcional)'}`;

    const campo = document.createElement('input');
    campo.id = `palabra-${i}`;
    campo.name = `palabra-${i}`;
    campo.maxLength = config.maxLargo;
    campo.autocomplete = 'off';
    campo.spellcheck = false;
    if (i === 0) campo.required = true;

    etiqueta.append(campo);
    contenedor.append(etiqueta);
  }
}

function mostrarPregunta(estado) {
  ocultarTodo();
  $('pregunta').textContent = estado.texto;
  const disponibles = estado.maxPalabras - estado.usadas;
  pintarCampos(disponibles);
  $('ayuda').textContent =
    disponibles === estado.maxPalabras
      ? `Una palabra por campo. Puedes escribir hasta ${disponibles}.`
      : `Te quedan ${disponibles} palabra(s) para esta pregunta.`;
  $('btn-enviar').disabled = false;
  $('bloque-pregunta').hidden = false;
}

// --- Carga del estado -----------------------------------------------------

async function cargar() {
  ocultarTodo();
  $('cargando').hidden = false;

  try {
    const estado = await pedir(`/sala/${codigo}?token=${identificador()}`);
    config = { maxPalabras: estado.maxPalabras, maxLargo: estado.maxLargo };

    if (!estado.preguntaActiva) {
      mostrarEspera();
      return;
    }
    if (estado.estado === 'cerrada') {
      mostrarListo('La votación se cerró. Espera la siguiente pregunta.');
      return;
    }
    if (estado.usadas >= estado.maxPalabras) {
      mostrarListo('Listo, ya enviaste tus palabras para esta pregunta.');
      return;
    }
    mostrarPregunta(estado);
  } catch (fallo) {
    if (fallo.estado === 404) {
      mostrarError('Esta sala ya no existe. Pídele el código nuevo a tu profesor.', {
        conActualizar: false,
      });
      $('form-codigo').hidden = false;
      return;
    }
    mostrarError('No hay conexión. Toca "Ver pregunta actual" para reintentar.');
  }
}

// --- Envío ----------------------------------------------------------------

async function enviar(palabras) {
  const cuerpo = { token: identificador(), palabras };
  try {
    return await pedir(`/sala/${codigo}/palabras`, { metodo: 'POST', cuerpo });
  } catch (fallo) {
    // Un reintento cubre el corte de conexión de un segundo, que en una sala
    // con 30 teléfonos pasa constantemente.
    if (fallo.estado) throw fallo;
    return pedir(`/sala/${codigo}/palabras`, { metodo: 'POST', cuerpo });
  }
}

$('form-palabras').addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const campos = [...$('campos').querySelectorAll('input')];
  const palabras = campos.map((campo) => campo.value).filter(esPalabraValida);

  if (palabras.length === 0) {
    $('ayuda').textContent = 'Escribe al menos una palabra.';
    return;
  }

  $('btn-enviar').disabled = true;
  $('btn-enviar').textContent = 'Enviando…';

  try {
    await enviar(palabras);
    mostrarListo('¡Listo! Tu respuesta ya está en la nube.');
  } catch (fallo) {
    if (fallo.estado === 409 || fallo.estado === 404) {
      await cargar();
      return;
    }
    // El botón nunca dice "enviado" si no llegó.
    $('ayuda').textContent = `No se pudo enviar: ${fallo.message}. Intenta de nuevo.`;
  } finally {
    $('btn-enviar').disabled = false;
    $('btn-enviar').textContent = 'Enviar';
  }
});

$('btn-actualizar').addEventListener('click', cargar);

$('form-codigo').addEventListener('submit', (evento) => {
  evento.preventDefault();
  const tecleado = normalizarCodigo($('codigo').value);
  if (!esCodigoValido(tecleado)) {
    mostrarError('Ese código no existe. Son 4 letras.', { conActualizar: false });
    $('form-codigo').hidden = false;
    return;
  }
  codigo = tecleado;
  history.replaceState(null, '', `?s=${codigo}`);
  $('form-codigo').hidden = true;
  cargar();
});

// --- Arranque -------------------------------------------------------------

(function arrancar() {
  const desdeUrl = normalizarCodigo(new URLSearchParams(location.search).get('s') ?? '');
  if (esCodigoValido(desdeUrl)) {
    codigo = desdeUrl;
    cargar();
    return;
  }
  ocultarTodo();
  $('form-codigo').hidden = false;
})();
