/**
 * Códigos de sala.
 *
 * Cuatro letras que un alumno tiene que leer desde el fondo de la sala y tipear
 * sin equivocarse. Por eso el alfabeto excluye I, L y O: proyectados y a
 * distancia se confunden con 1, 1 y 0.
 */

export const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const LARGO_CODIGO = 4;

/** 23^4 = 279.841 combinaciones. De sobra para salas que viven 6 horas. */
export function generarCodigo(aleatorio = Math.random) {
  let codigo = '';
  for (let i = 0; i < LARGO_CODIGO; i++) {
    const indice = Math.min(
      Math.floor(aleatorio() * ALFABETO.length),
      ALFABETO.length - 1,
    );
    codigo += ALFABETO[indice];
  }
  return codigo;
}

export function esCodigoValido(codigo) {
  if (typeof codigo !== 'string' || codigo.length !== LARGO_CODIGO) return false;
  return [...codigo].every((caracter) => ALFABETO.includes(caracter));
}

/** Tolera cómo lo tipea un alumno apurado: espacios de más y minúsculas. */
export function normalizarCodigo(entrada) {
  return typeof entrada === 'string' ? entrada.trim().toUpperCase() : '';
}
