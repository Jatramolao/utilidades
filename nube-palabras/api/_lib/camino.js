/**
 * Resolución del camino de la petición.
 *
 * Existe por un fallo concreto en producción: el catch-all por nombre de
 * archivo de Vercel (`api/[...ruta].js`) resolvía `/api/sala` pero devolvía un
 * NOT_FOUND de plataforma en `/api/sala/ABCD`. Es decir, matcheaba un segmento
 * y no dos, así que la app publicada podía crear salas y nada más.
 *
 * La solución fue dejar de depender de ese enrutado implícito: `vercel.json`
 * reescribe `/api/(.*)` a una función única pasando el camino en el parámetro
 * `ruta`. Aquí se acepta esa forma y también el camino normal de la URL, que es
 * el que usa el servidor local — así los dos entornos comparten handler.
 */

export const PARAM_RUTA = 'ruta';

/**
 * @param {URL} url
 * @returns {{segmentos: string[], consulta: Record<string,string>}}
 */
export function resolverPeticion(url) {
  const consulta = Object.fromEntries(url.searchParams);

  // El parámetro lo pone la reescritura, no el cliente: se saca de la consulta
  // para que no se cuele en los endpoints (el del alumno ya usa `token`).
  const reescrito = consulta[PARAM_RUTA];
  delete consulta[PARAM_RUTA];

  const crudo = reescrito ?? url.pathname;
  const segmentos = crudo.split('/').filter(Boolean);
  if (segmentos[0] === 'api') segmentos.shift();

  return { segmentos, consulta };
}
