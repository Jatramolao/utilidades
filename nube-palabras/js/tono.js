/**
 * Rampa de color de la nube.
 *
 * Más repetida, más protagonismo: sobre fondo claro las palabras dominantes se
 * oscurecen; sobre fondo oscuro se aclaran.
 *
 * Vive en su propio módulo por una razón concreta: así el contraste se puede
 * **medir con pruebas** en vez de confiar en el ojo. Un gris mal elegido se ve
 * perfecto en el portátil y desaparece proyectado en la última fila de la sala,
 * y es un fallo que no avisa.
 *
 * Módulo puro: sin DOM, sin efectos.
 */

/** Umbral AA de la WCAG para texto grande y de cuerpo. */
export const CONTRASTE_MINIMO = 4.5;

/**
 * Por tema: luminosidad del fondo, del extremo destacado (la palabra más
 * repetida) y del extremo suave (la que aparece una sola vez).
 *
 * El extremo suave es el que manda: es el que roza el mínimo de contraste, y
 * por eso está donde está y no más apagado.
 */
export const TEMAS = {
  claro: { fondo: 100, suave: 42, extremo: 12 },
  oscuro: { fondo: 12, suave: 58, extremo: 96 },
};

const temaValido = (tema) => (Object.hasOwn(TEMAS, tema ?? '') ? tema : 'claro');

/**
 * Luminosidad (0-100) que le toca a una palabra según cuánto se repitió.
 *
 * Con una sola palabra en pantalla no hay con qué compararla, así que se lleva
 * el extremo destacado: es la dominante por definición.
 */
export function luminosidadDe(conteo, maximo, tema) {
  const { suave, extremo } = TEMAS[temaValido(tema)];
  const proporcion = maximo > 1 ? (conteo - 1) / (maximo - 1) : 1;
  const acotada = Math.min(1, Math.max(0, proporcion));
  return suave + (extremo - suave) * acotada;
}

export function tonoDe(conteo, maximo, tema) {
  const luminosidad = Math.round(luminosidadDe(conteo, maximo, tema) * 10) / 10;
  return `hsl(0 0% ${luminosidad}%)`;
}

/** Luminancia relativa de un gris, según la fórmula de la WCAG. */
function luminancia(luminosidadPorciento) {
  const canal = luminosidadPorciento / 100;
  const lineal =
    canal <= 0.03928 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4;
  return lineal;
}

/** Relación de contraste entre dos grises, expresados en luminosidad 0-100. */
export function contraste(luminosidadA, luminosidadB) {
  const a = luminancia(luminosidadA);
  const b = luminancia(luminosidadB);
  const claro = Math.max(a, b);
  const oscuro = Math.min(a, b);
  return (claro + 0.05) / (oscuro + 0.05);
}
