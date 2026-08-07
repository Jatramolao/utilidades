/**
 * Codificador QR mínimo: modo byte, versiones 1 a 5, corrección de errores L.
 *
 * Es lo único no trivial que el proyecto escribe a mano, y se hace por una
 * razón concreta: es la pieza que hace que un alumno entre a la sala sin
 * tipear nada, y no vale la pena arrastrar una dependencia de npm ni un paso
 * de compilación por ~200 líneas de algoritmo que no va a cambiar nunca.
 *
 * Las versiones 1-5 con ECC L y un solo bloque cubren hasta 106 caracteres —
 * de sobra para una URL como https://nube-palabras.vercel.app/r?s=ABCD — y al
 * ser un solo bloque no hace falta intercalar bloques de corrección.
 */

// --- Aritmética en GF(256) ------------------------------------------------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // polinomio primitivo del estándar QR
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function multiplicarPolinomios(a, b) {
  const producto = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      producto[i + j] ^= mul(a[i], b[j]);
    }
  }
  return producto;
}

/** Polinomio generador de Reed-Solomon de grado `grado`. */
export function generador(grado) {
  let poli = [1];
  for (let i = 0; i < grado; i++) poli = multiplicarPolinomios(poli, [1, EXP[i]]);
  return poli;
}

/** Codewords de corrección de errores para un bloque de datos. */
export function calcularEcc(datos, cantidad) {
  const gen = generador(cantidad);
  const buffer = [...datos, ...new Array(cantidad).fill(0)];
  for (let i = 0; i < datos.length; i++) {
    const coeficiente = buffer[i];
    if (coeficiente === 0) continue;
    for (let j = 0; j < gen.length; j++) {
      buffer[i + j] ^= mul(gen[j], coeficiente);
    }
  }
  return buffer.slice(datos.length);
}

// --- Capacidades ----------------------------------------------------------

// { total: codewords totales, ecc: codewords de corrección } para nivel L.
const VERSIONES = [
  null,
  { total: 26, ecc: 7 },
  { total: 44, ecc: 10 },
  { total: 70, ecc: 15 },
  { total: 100, ecc: 20 },
  { total: 134, ecc: 26 },
];

const VERSION_MAX = VERSIONES.length - 1;
const BITS_ECC_L = 0b01;

/** Bytes de datos que caben: total - corrección - 2 (cabecera de 12 bits). */
export function capacidadBytes(version) {
  const v = VERSIONES[version];
  return v.total - v.ecc - 2;
}

export const CAPACIDAD_MAXIMA = capacidadBytes(VERSION_MAX);

function elegirVersion(cantidadBytes) {
  for (let v = 1; v <= VERSION_MAX; v++) {
    if (cantidadBytes <= capacidadBytes(v)) return v;
  }
  throw new Error(
    `El texto no cabe en un QR de versión ${VERSION_MAX}: ` +
      `${cantidadBytes} bytes, máximo ${CAPACIDAD_MAXIMA}.`,
  );
}

// --- Codificación de datos ------------------------------------------------

function aCodewords(bytes, version) {
  const codewordsDatos = VERSIONES[version].total - VERSIONES[version].ecc;
  const bits = [];
  const empujar = (valor, largo) => {
    for (let i = largo - 1; i >= 0; i--) bits.push((valor >> i) & 1);
  };

  empujar(0b0100, 4); // indicador de modo byte
  empujar(bytes.length, 8); // largo (8 bits para versiones 1-9)
  for (const byte of bytes) empujar(byte, 8);

  const capacidadBits = codewordsDatos * 8;
  for (let i = 0; i < 4 && bits.length < capacidadBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }

  const relleno = [0xec, 0x11];
  let i = 0;
  while (codewords.length < codewordsDatos) codewords.push(relleno[i++ % 2]);

  return codewords;
}

// --- Máscaras -------------------------------------------------------------

const MASCARAS = [
  (f, c) => (f + c) % 2 === 0,
  (f) => f % 2 === 0,
  (f, c) => c % 3 === 0,
  (f, c) => (f + c) % 3 === 0,
  (f, c) => (Math.floor(f / 2) + Math.floor(c / 3)) % 2 === 0,
  (f, c) => ((f * c) % 2) + ((f * c) % 3) === 0,
  (f, c) => (((f * c) % 2) + ((f * c) % 3)) % 2 === 0,
  (f, c) => (((f + c) % 2) + ((f * c) % 3)) % 2 === 0,
];

/**
 * Penalización para elegir máscara. Se aplican las reglas 1, 2 y 4 del
 * estándar; la 3 (patrones parecidos al buscador) se omite porque solo afina
 * la lectura en condiciones difíciles y cualquier máscara produce un QR
 * válido. Un código proyectado a pantalla completa no está en esa situación.
 */
function penalizacion(modulos, size) {
  let total = 0;

  // Regla 1: tiras de 5 o más módulos del mismo color.
  for (let i = 0; i < size; i++) {
    for (const porFila of [true, false]) {
      let color = null;
      let largo = 0;
      for (let j = 0; j < size; j++) {
        const actual = porFila ? modulos[i][j] : modulos[j][i];
        if (actual === color) {
          largo++;
        } else {
          if (largo >= 5) total += 3 + (largo - 5);
          color = actual;
          largo = 1;
        }
      }
      if (largo >= 5) total += 3 + (largo - 5);
    }
  }

  // Regla 2: bloques de 2x2 del mismo color.
  for (let f = 0; f < size - 1; f++) {
    for (let c = 0; c < size - 1; c++) {
      const v = modulos[f][c];
      if (v === modulos[f][c + 1] && v === modulos[f + 1][c] && v === modulos[f + 1][c + 1]) {
        total += 3;
      }
    }
  }

  // Regla 4: desbalance entre módulos oscuros y claros.
  let oscuros = 0;
  for (let f = 0; f < size; f++) for (let c = 0; c < size; c++) if (modulos[f][c]) oscuros++;
  const porcentaje = (oscuros * 100) / (size * size);
  total += Math.floor(Math.abs(porcentaje - 50) / 5) * 10;

  return total;
}

// --- Construcción de la matriz --------------------------------------------

function bitsFormato(mascara) {
  const datos = (BITS_ECC_L << 3) | mascara;
  let resto = datos << 10;
  for (let i = 4; i >= 0; i--) {
    if (resto & (1 << (i + 10))) resto ^= 0b10100110111 << i;
  }
  return ((datos << 10) | resto) ^ 0b101010000010010;
}

function construir(codewords, version, mascara) {
  const size = 17 + 4 * version;
  const modulos = Array.from({ length: size }, () => new Array(size).fill(false));
  const funcion = Array.from({ length: size }, () => new Array(size).fill(false));

  const set = (f, c, valor) => {
    if (f < 0 || f >= size || c < 0 || c >= size) return;
    modulos[f][c] = valor;
    funcion[f][c] = true;
  };

  // Buscadores (con su separador claro alrededor).
  for (const [f0, c0] of [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ]) {
    for (let f = -1; f <= 7; f++) {
      for (let c = -1; c <= 7; c++) {
        const dentro = f >= 0 && f <= 6 && c >= 0 && c <= 6;
        const oscuro =
          dentro &&
          (f === 0 || f === 6 || c === 0 || c === 6 || (f >= 2 && f <= 4 && c >= 2 && c <= 4));
        set(f0 + f, c0 + c, oscuro);
      }
    }
  }

  // Patrón de alineación (una sola posición en las versiones 2-5).
  if (version >= 2) {
    const centro = size - 7;
    for (let f = -2; f <= 2; f++) {
      for (let c = -2; c <= 2; c++) {
        set(centro + f, centro + c, Math.max(Math.abs(f), Math.abs(c)) !== 1);
      }
    }
  }

  // Patrones de sincronía.
  for (let i = 8; i < size - 8; i++) {
    const oscuro = i % 2 === 0;
    set(6, i, oscuro);
    set(i, 6, oscuro);
  }

  // Módulo oscuro fijo y reserva del área de formato.
  set(size - 8, 8, true);
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      set(8, i, false);
      set(i, 8, false);
    }
  }
  for (let i = 0; i < 7; i++) set(size - 1 - i, 8, false);
  for (let i = 0; i < 8; i++) set(8, size - 1 - i, false);

  // Datos, en zigzag desde la esquina inferior derecha.
  const todos = [...codewords, ...calcularEcc(codewords, VERSIONES[version].ecc)];
  let bit = 0;
  for (let der = size - 1; der >= 1; der -= 2) {
    if (der === 6) der = 5; // la columna 6 es sincronía, se salta
    for (let vertical = 0; vertical < size; vertical++) {
      for (let j = 0; j < 2; j++) {
        const c = der - j;
        const haciaArriba = ((der + 1) & 2) === 0;
        const f = haciaArriba ? size - 1 - vertical : vertical;
        if (!funcion[f][c] && bit < todos.length * 8) {
          modulos[f][c] = ((todos[bit >>> 3] >>> (7 - (bit & 7))) & 1) === 1;
          bit++;
        }
      }
    }
  }

  // Máscara, solo sobre los módulos de datos.
  const aplicar = MASCARAS[mascara];
  for (let f = 0; f < size; f++) {
    for (let c = 0; c < size; c++) {
      if (!funcion[f][c] && aplicar(f, c)) modulos[f][c] = !modulos[f][c];
    }
  }

  // Información de formato, en sus dos copias.
  const formato = bitsFormato(mascara);
  const leer = (i) => ((formato >> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) modulos[i][8] = leer(i);
  modulos[7][8] = leer(6);
  modulos[8][8] = leer(7);
  modulos[8][7] = leer(8);
  for (let i = 9; i < 15; i++) modulos[8][14 - i] = leer(i);
  for (let i = 0; i < 8; i++) modulos[8][size - 1 - i] = leer(i);
  for (let i = 8; i < 15; i++) modulos[size - 15 + i][8] = leer(i);

  return { modulos, size };
}

// --- API pública ----------------------------------------------------------

/**
 * Devuelve la matriz de módulos (true = oscuro), sin zona de silencio.
 * Elige automáticamente versión y máscara.
 */
export function generarMatriz(texto) {
  const bytes = [...new TextEncoder().encode(String(texto))];
  const version = elegirVersion(bytes.length);
  const codewords = aCodewords(bytes, version);

  let mejor = null;
  for (let mascara = 0; mascara < 8; mascara++) {
    const candidato = construir(codewords, version, mascara);
    const puntaje = penalizacion(candidato.modulos, candidato.size);
    if (!mejor || puntaje < mejor.puntaje) mejor = { ...candidato, puntaje, mascara };
  }
  return mejor.modulos;
}

/**
 * QR como SVG autocontenido. Se entrega en SVG y no en canvas porque en un
 * proyector tiene que escalar a pantalla completa sin perder el filo de los
 * módulos: un QR borroso no lo lee ningún teléfono.
 */
export function comoSvg(texto, { margen = 4, claro = '#ffffff', oscuro = '#000000' } = {}) {
  const modulos = generarMatriz(texto);
  const size = modulos.length;
  const total = size + margen * 2;

  let camino = '';
  for (let f = 0; f < size; f++) {
    for (let c = 0; c < size; c++) {
      if (modulos[f][c]) camino += `M${c + margen} ${f + margen}h1v1h-1z`;
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" ` +
    `shape-rendering="crispEdges" role="img" aria-label="Código QR para entrar a la sala">` +
    `<rect width="${total}" height="${total}" fill="${claro}"/>` +
    `<path d="${camino}" fill="${oscuro}"/>` +
    `</svg>`
  );
}

/** Solo para las pruebas. */
export const _internos = { EXP, LOG, mul, VERSIONES, bitsFormato, MASCARAS };
