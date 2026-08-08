import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generarMatriz,
  comoSvg,
  generador,
  calcularEcc,
  capacidadBytes,
  CAPACIDAD_MAXIMA,
  _internos,
} from '../js/qr.js';

const { EXP, LOG, mul, bitsFormato } = _internos;

// --- Aritmética del cuerpo finito ----------------------------------------

test('el cuerpo GF(256) usa el polinomio del estándar QR', () => {
  // x^8 = x^4 + x^3 + x^2 + 1 con el primitivo 0x11d.
  assert.equal(EXP[0], 1);
  assert.equal(EXP[8], 0x1d);
  assert.equal(EXP[255], 1);
});

test('logaritmo y exponencial son inversos', () => {
  for (let i = 1; i < 256; i++) assert.equal(EXP[LOG[i]], i);
});

test('la multiplicación se comporta como multiplicación', () => {
  for (let a = 1; a < 256; a += 17) {
    assert.equal(mul(a, 1), a);
    assert.equal(mul(a, 0), 0);
    for (let b = 1; b < 256; b += 23) {
      assert.equal(mul(a, b), mul(b, a));
    }
  }
});

// --- Reed-Solomon ---------------------------------------------------------

test('el polinomio generador tiene el grado pedido y es mónico', () => {
  for (const grado of [7, 10, 15, 20, 26]) {
    const poli = generador(grado);
    assert.equal(poli.length, grado + 1);
    assert.equal(poli[0], 1);
  }
});

test('la palabra de código resultante es divisible por el generador', () => {
  // La propiedad que define un código Reed-Solomon: el polinomio completo
  // (datos + corrección) se anula en las primeras `n` potencias de alfa.
  // Si esto pasa, cualquier decodificador del mundo puede leer el bloque.
  const datos = Array.from({ length: 19 }, (_, i) => (i * 37 + 11) % 256);
  const cantidad = 7;
  const completo = [...datos, ...calcularEcc(datos, cantidad)];

  for (let i = 0; i < cantidad; i++) {
    let valor = 0;
    for (const coeficiente of completo) valor = mul(valor, EXP[i]) ^ coeficiente;
    assert.equal(valor, 0, `el síndrome ${i} debería anularse`);
  }
});

// --- Información de formato ----------------------------------------------

test('los bits de formato coinciden con la tabla del estándar', () => {
  // Nivel L, máscara 0: valor tabulado en la norma ISO/IEC 18004.
  assert.equal(bitsFormato(0), 0b111011111000100);
});

test('cada máscara produce un formato distinto de 15 bits', () => {
  const vistos = new Set();
  for (let mascara = 0; mascara < 8; mascara++) {
    const bits = bitsFormato(mascara);
    assert.ok(bits >= 0 && bits < 1 << 15);
    vistos.add(bits);
  }
  assert.equal(vistos.size, 8);
});

// --- Estructura de la matriz ---------------------------------------------

const tamano = (texto) => generarMatriz(texto).length;

test('elige la versión más chica que alcanza', () => {
  assert.equal(capacidadBytes(1), 17);
  assert.equal(capacidadBytes(5), 106);
  assert.equal(CAPACIDAD_MAXIMA, 106);

  assert.equal(tamano('a'.repeat(17)), 21, 'versión 1');
  assert.equal(tamano('a'.repeat(18)), 25, 'versión 2');
  assert.equal(tamano('a'.repeat(32)), 25, 'versión 2');
  assert.equal(tamano('a'.repeat(33)), 29, 'versión 3');
  assert.equal(tamano('a'.repeat(53)), 29, 'versión 3');
  assert.equal(tamano('a'.repeat(54)), 33, 'versión 4');
  assert.equal(tamano('a'.repeat(79)), 37, 'versión 5');
});

test('una URL de sala real cabe holgadamente', () => {
  const url = 'https://nube-palabras.vercel.app/r?s=ABCD';
  assert.ok(url.length < CAPACIDAD_MAXIMA);
  assert.equal(tamano(url), 29);
});

test('avisa cuando el texto no cabe', () => {
  assert.throws(() => generarMatriz('a'.repeat(CAPACIDAD_MAXIMA + 1)), /no cabe/);
});

test('los tres buscadores están donde corresponde', () => {
  const m = generarMatriz('https://nube-palabras.vercel.app/r?s=ABCD');
  const size = m.length;
  const esperado = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1],
  ];

  for (const [f0, c0] of [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ]) {
    for (let f = 0; f < 7; f++) {
      for (let c = 0; c < 7; c++) {
        assert.equal(
          m[f0 + f][c0 + c],
          esperado[f][c] === 1,
          `buscador en (${f0},${c0}) módulo (${f},${c})`,
        );
      }
    }
  }
});

test('los separadores alrededor del buscador quedan claros', () => {
  const m = generarMatriz('hola');
  for (let i = 0; i <= 7; i++) {
    assert.equal(m[7][i], false, `separador horizontal en la columna ${i}`);
    assert.equal(m[i][7], false, `separador vertical en la fila ${i}`);
  }
});

test('los patrones de sincronía alternan', () => {
  const m = generarMatriz('https://nube-palabras.vercel.app/r?s=ABCD');
  const size = m.length;
  for (let i = 8; i < size - 8; i++) {
    assert.equal(m[6][i], i % 2 === 0, `sincronía horizontal en ${i}`);
    assert.equal(m[i][6], i % 2 === 0, `sincronía vertical en ${i}`);
  }
});

test('el módulo oscuro fijo está oscuro', () => {
  const m = generarMatriz('hola');
  assert.equal(m[m.length - 8][8], true);
});

test('el patrón de alineación existe desde la versión 2', () => {
  const m = generarMatriz('a'.repeat(30)); // versión 2
  const centro = m.length - 7;
  assert.equal(m[centro][centro], true, 'centro oscuro');
  assert.equal(m[centro - 1][centro - 1], false, 'anillo claro');
  assert.equal(m[centro - 2][centro - 2], true, 'borde oscuro');
});

test('la matriz es cuadrada y determinista', () => {
  const primera = generarMatriz('https://nube-palabras.vercel.app/r?s=ABCD');
  const segunda = generarMatriz('https://nube-palabras.vercel.app/r?s=ABCD');
  assert.deepEqual(primera, segunda);
  for (const fila of primera) assert.equal(fila.length, primera.length);
});

test('textos distintos dan matrices distintas', () => {
  const a = generarMatriz('https://nube-palabras.vercel.app/r?s=ABCD');
  const b = generarMatriz('https://nube-palabras.vercel.app/r?s=ABCE');
  assert.notDeepEqual(a, b);
});

// --- SVG ------------------------------------------------------------------

test('el SVG incluye la zona de silencio y escala solo', () => {
  const svg = comoSvg('hola', { margen: 4 });
  assert.match(svg, /viewBox="0 0 29 29"/); // 21 + 4 + 4
  assert.match(svg, /shape-rendering="crispEdges"/);
  assert.ok(
    !/<svg[^>]*\swidth=/.test(svg),
    'la etiqueta <svg> no lleva tamaño fijo: lo define el CSS',
  );
});

test('el SVG dibuja tantos módulos como oscuros tiene la matriz', () => {
  const m = generarMatriz('hola');
  const oscuros = m.flat().filter(Boolean).length;
  const svg = comoSvg('hola');
  assert.equal(svg.match(/M\d+ \d+h1v1h-1z/g).length, oscuros);
});
