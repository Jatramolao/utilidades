import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALFABETO,
  LARGO_CODIGO,
  generarCodigo,
  esCodigoValido,
  normalizarCodigo,
} from '../js/codigo.js';

test('el alfabeto excluye los caracteres confundibles', () => {
  for (const prohibido of ['I', 'L', 'O', '0', '1']) {
    assert.equal(
      ALFABETO.includes(prohibido),
      false,
      `${prohibido} se confunde a distancia o al tipear`,
    );
  }
});

test('genera códigos del largo definido y solo con el alfabeto', () => {
  for (let i = 0; i < 500; i++) {
    const codigo = generarCodigo();
    assert.equal(codigo.length, LARGO_CODIGO);
    assert.ok(esCodigoValido(codigo), `${codigo} debería ser válido`);
  }
});

test('generarCodigo es determinista con una fuente de azar dada', () => {
  const cero = () => 0;
  assert.equal(generarCodigo(cero), ALFABETO[0].repeat(LARGO_CODIGO));
});

test('generarCodigo nunca se pasa del final del alfabeto', () => {
  const casiUno = () => 0.9999999;
  const codigo = generarCodigo(casiUno);
  assert.equal(codigo, ALFABETO[ALFABETO.length - 1].repeat(LARGO_CODIGO));
  assert.ok(esCodigoValido(codigo));
});

test('esCodigoValido rechaza lo que no corresponde', () => {
  assert.equal(esCodigoValido('ABCD'), true);
  assert.equal(esCodigoValido('ABC'), false);
  assert.equal(esCodigoValido('ABCDE'), false);
  assert.equal(esCodigoValido('abcd'), false);
  assert.equal(esCodigoValido('ABOD'), false, 'contiene O');
  assert.equal(esCodigoValido('AB1D'), false);
  assert.equal(esCodigoValido(''), false);
  assert.equal(esCodigoValido(null), false);
  assert.equal(esCodigoValido(1234), false);
});

test('normalizarCodigo tolera cómo lo tipea un alumno apurado', () => {
  assert.equal(normalizarCodigo(' abcd '), 'ABCD');
  assert.equal(normalizarCodigo('AbCd'), 'ABCD');
  assert.equal(normalizarCodigo(null), '');
});

test('el espacio de códigos es suficientemente grande', () => {
  assert.ok(ALFABETO.length ** LARGO_CODIGO > 100_000);
});
