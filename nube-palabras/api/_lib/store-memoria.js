/**
 * Almacén en memoria con la misma interfaz que el de Redis.
 *
 * Sirve para dos cosas: correr las pruebas sin red, y levantar el servidor
 * local (`npm run dev`) sin credenciales de Upstash. La lógica de la API no
 * sabe cuál de los dos está usando.
 */

export function crearStoreMemoria({ ahora = () => Date.now() } = {}) {
  /** @type {Map<string, {campos: Map<string, string>, vence: number}>} */
  const claves = new Map();

  function vivo(clave) {
    const entrada = claves.get(clave);
    if (!entrada) return null;
    if (entrada.vence <= ahora()) {
      claves.delete(clave);
      return null;
    }
    return entrada;
  }

  function obtenerOCrear(clave) {
    const entrada = vivo(clave);
    if (entrada) return entrada;
    const nueva = { campos: new Map(), vence: Infinity };
    claves.set(clave, nueva);
    return nueva;
  }

  return {
    async hset(clave, objeto) {
      const entrada = obtenerOCrear(clave);
      for (const [campo, valor] of Object.entries(objeto)) {
        entrada.campos.set(campo, String(valor));
      }
    },

    async hgetall(clave) {
      const entrada = vivo(clave);
      if (!entrada || entrada.campos.size === 0) return null;
      return Object.fromEntries(entrada.campos);
    },

    async hget(clave, campo) {
      const entrada = vivo(clave);
      if (!entrada) return null;
      return entrada.campos.has(campo) ? entrada.campos.get(campo) : null;
    },

    async hincrby(clave, campo, delta) {
      const entrada = obtenerOCrear(clave);
      const actual = Number(entrada.campos.get(campo) ?? 0);
      const nuevo = actual + delta;
      entrada.campos.set(campo, String(nuevo));
      return nuevo;
    },

    async hdel(clave, campo) {
      const entrada = vivo(clave);
      if (!entrada) return 0;
      return entrada.campos.delete(campo) ? 1 : 0;
    },

    async hlen(clave) {
      const entrada = vivo(clave);
      return entrada ? entrada.campos.size : 0;
    },

    async expire(clave, segundos) {
      const entrada = vivo(clave);
      if (entrada) entrada.vence = ahora() + segundos * 1000;
    },

    async existe(clave) {
      return vivo(clave) !== null;
    },

    /** Contador con expiración, para el tope por IP. */
    async incrConTtl(clave, segundos) {
      const entrada = obtenerOCrear(clave);
      const nuevo = Number(entrada.campos.get('n') ?? 0) + 1;
      entrada.campos.set('n', String(nuevo));
      if (entrada.vence === Infinity) entrada.vence = ahora() + segundos * 1000;
      return nuevo;
    },
  };
}
