/**
 * Normalización de palabras.
 *
 * Es lo que hace que la nube sirva: si "Apertura", "apertura" y "apertura."
 * cuentan como tres términos distintos, no hay nube, hay una lista.
 *
 * Módulo puro y compartido: lo usa el navegador del alumno para validar antes
 * de enviar, y el servidor para agrupar. Sin dependencias, sin efectos.
 */

export const MAX_LARGO = 30;

// La ñ se protege antes de descomponer los acentos. Sin esto, "año" se
// normalizaría a "ano" y se fusionaría con otra palabra — exactamente el tipo
// de accidente que no puede aparecer proyectado frente a un curso.
// Se usa un carácter de control que ningún alumno puede tipear.
const MARCA_ENIE = String.fromCharCode(1);

const MARCAS_COMBINANTES = /\p{M}/gu;
const PUNTUACION_EXTREMOS = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
const ESPACIOS = /\s+/g;

/**
 * Forma canónica para agrupar. Nunca se muestra en pantalla: solo se usa como
 * clave de conteo.
 */
export function normalizar(entrada) {
  if (typeof entrada !== 'string') return '';

  return entrada
    .replace(/ñ/g, MARCA_ENIE)
    .replace(/Ñ/g, MARCA_ENIE)
    .normalize('NFD')
    .replace(MARCAS_COMBINANTES, '')
    .toLowerCase()
    .replaceAll(MARCA_ENIE, 'ñ')
    .replace(ESPACIOS, ' ')
    .trim()
    .replace(PUNTUACION_EXTREMOS, '');
}

/**
 * Forma que sí se muestra: conserva tildes y mayúsculas tal como las escribió
 * el alumno, pero recortada y acotada al largo máximo.
 */
export function limpiarOriginal(entrada) {
  if (typeof entrada !== 'string') return '';
  return entrada.replace(ESPACIOS, ' ').trim().slice(0, MAX_LARGO);
}

/**
 * Una palabra vale si, después de limpiarla, queda algo que agrupar.
 * "..." y "   " no valen y se descartan en silencio.
 */
export function esPalabraValida(entrada) {
  const limpia = limpiarOriginal(entrada);
  if (limpia.length === 0) return false;
  return normalizar(limpia).length > 0;
}
