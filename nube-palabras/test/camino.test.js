import test from 'node:test';
import assert from 'node:assert/strict';
import { resolverPeticion } from '../api/_lib/camino.js';

const pedir = (ruta) => resolverPeticion(new URL(ruta, 'https://ejemplo.test'));

test('camino normal: el del servidor local', () => {
  assert.deepEqual(pedir('/api/sala').segmentos, ['sala']);
  assert.deepEqual(pedir('/api/sala/ABCD').segmentos, ['sala', 'ABCD']);
  assert.deepEqual(pedir('/api/sala/ABCD/pregunta/1/nube').segmentos, [
    'sala', 'ABCD', 'pregunta', '1', 'nube',
  ]);
});

test('camino reescrito: el que entrega Vercel', () => {
  // Es el caso que estaba roto en producción: dos segmentos o más.
  assert.deepEqual(pedir('/api/index?ruta=sala').segmentos, ['sala']);
  assert.deepEqual(pedir('/api/index?ruta=sala/ABCD').segmentos, ['sala', 'ABCD']);
  assert.deepEqual(
    pedir('/api/index?ruta=sala/ABCD/pregunta/2/cerrar').segmentos,
    ['sala', 'ABCD', 'pregunta', '2', 'cerrar'],
  );
});

test('el parámetro de la reescritura no se cuela en la consulta', () => {
  const { consulta } = pedir('/api/index?ruta=sala/ABCD&token=telefono-1');
  assert.deepEqual(consulta, { token: 'telefono-1' });
});

test('conserva la consulta real en el camino normal', () => {
  const { consulta } = pedir('/api/sala/ABCD?token=telefono-1');
  assert.deepEqual(consulta, { token: 'telefono-1' });
});

test('tolera barras de más y caminos vacíos', () => {
  assert.deepEqual(pedir('/api/sala//ABCD/').segmentos, ['sala', 'ABCD']);
  assert.deepEqual(pedir('/api/index?ruta=/sala/ABCD/').segmentos, ['sala', 'ABCD']);
  assert.deepEqual(pedir('/api').segmentos, []);
  assert.deepEqual(pedir('/api/index?ruta=').segmentos, []);
});

test('no se traga un segmento llamado "api" que venga después', () => {
  assert.deepEqual(pedir('/api/index?ruta=sala/api').segmentos, ['sala', 'api']);
});

test('la palabra eliminada viaja codificada y llega entera', () => {
  const { segmentos } = pedir(
    `/api/index?ruta=${encodeURIComponent('sala/ABCD/pregunta/1/palabra/año nuevo')}`,
  );
  assert.deepEqual(segmentos, ['sala', 'ABCD', 'pregunta', '1', 'palabra', 'año nuevo']);
});
