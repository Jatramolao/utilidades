import test from 'node:test';
import assert from 'node:assert/strict';

import { CURVA, tamanoFuente, conteoDeTecho } from '../js/nube.js';

/*
 * La curva de tamaño se prueba aquí por la misma razón que el contraste se
 * prueba en `tono.test.js`: es una decisión de diseño que se ve bien en el
 * portátil y falla proyectada, y el ojo no avisa.
 */

const PROYECTOR = 1000; // lado corto de la nube, en píxeles

test('una palabra que apareció una sola vez se queda en el mínimo', () => {
  assert.equal(tamanoFuente(1, PROYECTOR), PROYECTOR * CURVA.minimoRelativo);
});

test('en una pantalla chica manda el mínimo absoluto, no el relativo', () => {
  assert.equal(tamanoFuente(1, 200), CURVA.minimoAbsoluto);
});

test('el tamaño nunca supera el máximo, por muchos votos que reciba', () => {
  assert.equal(tamanoFuente(9999, PROYECTOR), PROYECTOR * CURVA.maximoRelativo);
});

test('crece con el conteo y nunca decrece', () => {
  let previo = 0;
  for (let conteo = 1; conteo <= 60; conteo++) {
    const actual = tamanoFuente(conteo, PROYECTOR);
    assert.ok(actual >= previo, `bajó en ${conteo}`);
    previo = actual;
  }
});

test('conteoDeTecho es el conteo en que se toca el máximo', () => {
  const techo = conteoDeTecho(CURVA);
  const justoAntes = tamanoFuente(Math.floor(techo) - 1, PROYECTOR);
  assert.ok(justoAntes < PROYECTOR * CURVA.maximoRelativo);
  assert.equal(tamanoFuente(Math.ceil(techo), PROYECTOR), PROYECTOR * CURVA.maximoRelativo);
});

/*
 * Las dos reglas de sala. No describen la curva: la condicionan.
 *
 * Una curva puede ser suave, elegante y no jerarquizar nada proyectada, y eso
 * no se ve en el portátil. Si alguien vuelve a tocar `crecimiento`, estas dos
 * pruebas son las que avisan.
 */
test('el techo se alcanza dentro de lo que da un curso real', () => {
  const techo = conteoDeTecho(CURVA);
  assert.ok(techo <= 12, `techo a las ${techo.toFixed(0)} repeticiones: un curso no llega`);
});

test('la palabra dominante triplica como mínimo a una respuesta única', () => {
  // 9 votos: lo que reúne la respuesta más repetida en un curso de ~25.
  const razon = tamanoFuente(9, PROYECTOR) / tamanoFuente(1, PROYECTOR);
  assert.ok(razon >= 3, `la dominante solo mide ${razon.toFixed(2)}× la más chica`);
});
