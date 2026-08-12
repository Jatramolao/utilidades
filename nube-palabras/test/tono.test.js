import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TEMAS,
  luminosidadDe,
  tonoDe,
  contraste,
  CONTRASTE_MINIMO,
} from '../js/tono.js';

const CONTEOS = Array.from({ length: 50 }, (_, i) => i + 1);

test('la rampa nunca se sale del rango de luminosidad', () => {
  for (const tema of Object.keys(TEMAS)) {
    for (const maximo of [1, 3, 10, 50]) {
      for (const conteo of CONTEOS.filter((c) => c <= maximo)) {
        const l = luminosidadDe(conteo, maximo, tema);
        assert.ok(l >= 0 && l <= 100, `${tema}: luminosidad ${l} fuera de rango`);
      }
    }
  }
});

test('contraste suficiente contra el fondo en TODO el rango y en ambos temas', () => {
  // El gris mal elegido es el fallo silencioso clásico: se ve bien en el
  // portátil y desaparece proyectado al fondo de la sala. Aquí se mide.
  for (const [tema, def] of Object.entries(TEMAS)) {
    for (const maximo of [1, 2, 5, 12, 50]) {
      for (const conteo of CONTEOS.filter((c) => c <= maximo)) {
        const l = luminosidadDe(conteo, maximo, tema);
        const razon = contraste(l, def.fondo);
        assert.ok(
          razon >= CONTRASTE_MINIMO,
          `${tema}: conteo ${conteo}/${maximo} da ${razon.toFixed(2)}:1, bajo el mínimo`,
        );
      }
    }
  }
});

test('en tema claro, la más repetida es la más oscura', () => {
  const menos = luminosidadDe(1, 10, 'claro');
  const mas = luminosidadDe(10, 10, 'claro');
  assert.ok(mas < menos, 'la palabra dominante debe ser la más oscura sobre fondo claro');
});

test('en tema oscuro, la más repetida es la más clara', () => {
  const menos = luminosidadDe(1, 10, 'oscuro');
  const mas = luminosidadDe(10, 10, 'oscuro');
  assert.ok(mas > menos, 'la palabra dominante debe ser la más clara sobre fondo oscuro');
});

test('la rampa es monótona: más conteo nunca resta protagonismo', () => {
  for (const tema of Object.keys(TEMAS)) {
    const direccion = tema === 'claro' ? -1 : 1;
    let anterior = luminosidadDe(1, 20, tema);
    for (const conteo of CONTEOS.filter((c) => c <= 20).slice(1)) {
      const actual = luminosidadDe(conteo, 20, tema);
      assert.ok(
        (actual - anterior) * direccion >= 0,
        `${tema}: en el conteo ${conteo} la rampa retrocede`,
      );
      anterior = actual;
    }
  }
});

test('con una sola palabra en pantalla, esa palabra va al extremo destacado', () => {
  for (const tema of Object.keys(TEMAS)) {
    const sola = luminosidadDe(1, 1, tema);
    const dominante = luminosidadDe(9, 9, tema);
    assert.equal(sola, dominante, `${tema}: sin comparación, la única palabra manda`);
  }
});

test('tonoDe devuelve un color CSS válido', () => {
  assert.match(tonoDe(3, 7, 'claro'), /^hsl\(0 0% \d+(\.\d+)?%\)$/);
  assert.match(tonoDe(3, 7, 'oscuro'), /^hsl\(0 0% \d+(\.\d+)?%\)$/);
});

test('un tema desconocido no revienta: cae en claro', () => {
  assert.equal(tonoDe(3, 7, 'inventado'), tonoDe(3, 7, 'claro'));
  assert.equal(tonoDe(3, 7, undefined), tonoDe(3, 7, 'claro'));
});

test('el cálculo de contraste coincide con casos conocidos', () => {
  // Negro sobre blanco es 21:1; blanco sobre blanco es 1:1.
  assert.ok(Math.abs(contraste(0, 100) - 21) < 0.1);
  assert.ok(Math.abs(contraste(100, 100) - 1) < 0.01);
  // Gris 46% sobre blanco ronda 4,5:1, el umbral de AA.
  assert.ok(contraste(46, 100) > 4 && contraste(46, 100) < 5);
});
