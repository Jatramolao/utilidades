import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizar,
  limpiarOriginal,
  esPalabraValida,
  MAX_LARGO,
} from '../js/normalizar.js';

test('agrupa mayúsculas y minúsculas', () => {
  assert.equal(normalizar('Apertura'), normalizar('apertura'));
  assert.equal(normalizar('APERTURA'), 'apertura');
});

test('agrupa con y sin tildes', () => {
  assert.equal(normalizar('fotografía'), normalizar('Fotografia'));
  assert.equal(normalizar('exposición'), 'exposicion');
  assert.equal(normalizar('diéresis'), 'dieresis');
});

test('la ñ no se convierte en n', () => {
  // Perder la ñ fusionaría "año" con "ano", que es exactamente el tipo de
  // accidente que no puede aparecer proyectado frente a un curso.
  assert.equal(normalizar('año'), 'año');
  assert.notEqual(normalizar('año'), normalizar('ano'));
});

test('recorta y colapsa espacios', () => {
  assert.equal(normalizar('  apertura  '), 'apertura');
  assert.equal(normalizar('regla   de   tercios'), 'regla de tercios');
});

test('ignora puntuación en los extremos', () => {
  assert.equal(normalizar('apertura.'), 'apertura');
  assert.equal(normalizar('¿apertura?'), 'apertura');
  assert.equal(normalizar('«apertura»'), 'apertura');
});

test('NO fusiona singular con plural', () => {
  // Es la regla que el diseño rechaza a propósito: destroza estas palabras.
  assert.notEqual(normalizar('lente'), normalizar('lentes'));
  assert.equal(normalizar('análisis'), 'analisis');
  assert.equal(normalizar('crisis'), 'crisis');
  assert.equal(normalizar('síntesis'), 'sintesis');
  assert.equal(normalizar('lunes'), 'lunes');
});

test('entradas basura devuelven cadena vacía', () => {
  assert.equal(normalizar(''), '');
  assert.equal(normalizar('   '), '');
  assert.equal(normalizar('...'), '');
  assert.equal(normalizar(null), '');
  assert.equal(normalizar(undefined), '');
  assert.equal(normalizar(42), '');
});

test('limpiarOriginal conserva tildes y mayúsculas pero recorta', () => {
  assert.equal(limpiarOriginal('  Fotografía  '), 'Fotografía');
  assert.equal(limpiarOriginal('regla   de  tercios'), 'regla de tercios');
});

test('limpiarOriginal corta al largo máximo', () => {
  const larga = 'a'.repeat(200);
  assert.equal(limpiarOriginal(larga).length, MAX_LARGO);
});

test('esPalabraValida rechaza vacíos y solo-puntuación', () => {
  assert.equal(esPalabraValida('apertura'), true);
  assert.equal(esPalabraValida('  iso  '), true);
  assert.equal(esPalabraValida(''), false);
  assert.equal(esPalabraValida('   '), false);
  assert.equal(esPalabraValida('...'), false);
  assert.equal(esPalabraValida(null), false);
});
