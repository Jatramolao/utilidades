/**
 * Dibujo de la nube.
 *
 * Requisito que manda sobre todo lo demás: **el layout es estable**. Una
 * palabra que ya está en pantalla no se mueve cuando su conteo sube; solo
 * escala. Si la nube se reordenara en cada actualización, proyectada a pantalla
 * completa cada 2 segundos, sería ilegible y mareante.
 *
 * Por eso el tamaño de fuente es absoluto (depende solo del conteo de esa
 * palabra) y no relativo al máximo: si dependiera del máximo, una sola palabra
 * nueva reescalaría toda la pantalla.
 */

const PASO_ESPIRAL = 0.18;
const VUELTAS_MAX = 60;
const SEPARACION = 6; // px de aire entre palabras
const APLASTADO = 0.62; // la espiral se achata para aprovechar pantallas anchas

export function crearNube(contenedor, { alSeleccionar } = {}) {
  /** @type {Map<string, {el: HTMLElement, x: number, y: number, conteo: number, ancho: number, alto: number}>} */
  const puestas = new Map();
  let escala = 1;

  function dimensiones() {
    return {
      ancho: contenedor.clientWidth,
      alto: contenedor.clientHeight,
      unidad: Math.min(contenedor.clientWidth, contenedor.clientHeight),
    };
  }

  function tamanoFuente(conteo, unidad) {
    const minimo = Math.max(22, unidad * 0.055);
    const maximo = unidad * 0.22;
    const crecido = minimo * (1 + 0.55 * Math.sqrt(Math.max(0, conteo - 1)));
    return Math.min(maximo, crecido) * escala;
  }

  function tono(conteo, maximo) {
    // Más repetida, más oscura. El extremo claro se queda en 42% de luminosidad
    // para no bajar del contraste que exige leerse desde el fondo de la sala.
    const proporcion = maximo > 1 ? (conteo - 1) / (maximo - 1) : 1;
    return `hsl(0 0% ${Math.round(42 - proporcion * 30)}%)`;
  }

  function crearElemento(palabra) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'palabra';
    el.textContent = palabra.texto;
    el.dataset.clave = palabra.clave;
    el.addEventListener('click', () => alSeleccionar?.(palabra));
    contenedor.append(el);
    return el;
  }

  /**
   * Regla de medición: un elemento gemelo, oculto y sin transiciones.
   *
   * Medir sobre el elemento real devuelve su ancho *a mitad* de la animación de
   * `font-size`, porque leer `offsetWidth` justo después de cambiar el tamaño
   * da el valor de partida, no el de destino. Con las medidas mal, la detección
   * de choques falla y las palabras terminan encimadas en el proyector.
   */
  const regla = document.createElement('span');
  regla.className = 'palabra palabra--regla';
  regla.setAttribute('aria-hidden', 'true');
  contenedor.append(regla);

  function medirTexto(texto, tamano) {
    regla.textContent = texto;
    regla.style.fontSize = `${tamano}px`;
    return { ancho: regla.offsetWidth, alto: regla.offsetHeight };
  }

  function chocan(a, b) {
    return (
      Math.abs(a.x - b.x) * 2 < a.ancho + b.ancho + SEPARACION * 2 &&
      Math.abs(a.y - b.y) * 2 < a.alto + b.alto + SEPARACION * 2
    );
  }

  /** Busca el primer hueco libre siguiendo una espiral de Arquímedes. */
  function buscarHueco(caja, ocupadas, { ancho, alto }) {
    for (let t = 0; t < VUELTAS_MAX * Math.PI * 2; t += PASO_ESPIRAL) {
      const radio = 3.2 * t;
      const x = radio * Math.cos(t);
      const y = radio * Math.sin(t) * APLASTADO;

      if (Math.abs(x) + caja.ancho / 2 > ancho / 2) continue;
      if (Math.abs(y) + caja.alto / 2 > alto / 2) continue;

      const candidata = { x, y, ancho: caja.ancho, alto: caja.alto };
      if (!ocupadas.some((otra) => chocan(candidata, otra))) return { x, y };
    }
    return null;
  }

  function ubicar(el, x, y) {
    el.style.transform = `translate(calc(-50% + ${Math.round(x)}px), calc(-50% + ${Math.round(y)}px))`;
  }

  /** Recoloca todo desde cero. Solo se llama cuando algo dejó de caber. */
  function recolocarTodo(palabras, geometria, maximo) {
    const ocupadas = [];
    const ordenadas = [...palabras].sort((a, b) => b.conteo - a.conteo);

    for (const palabra of ordenadas) {
      const puesta = puestas.get(palabra.clave);
      if (!puesta) continue;
      const tamano = tamanoFuente(palabra.conteo, geometria.unidad);
      puesta.el.style.fontSize = `${tamano}px`;
      puesta.el.style.color = tono(palabra.conteo, maximo);
      const caja = medirTexto(palabra.texto, tamano);
      const hueco = buscarHueco(caja, ocupadas, geometria);
      if (!hueco) return false;

      Object.assign(puesta, { ...hueco, ...caja, conteo: palabra.conteo });
      ubicar(puesta.el, hueco.x, hueco.y);
      ocupadas.push({ ...hueco, ...caja });
    }
    return true;
  }

  function actualizar(palabras) {
    const geometria = dimensiones();
    if (geometria.unidad === 0) return;

    const vigentes = new Set(palabras.map((p) => p.clave));
    for (const [clave, puesta] of puestas) {
      if (!vigentes.has(clave)) {
        puesta.el.remove();
        puestas.delete(clave);
      }
    }

    const maximo = palabras.reduce((mayor, p) => Math.max(mayor, p.conteo), 1);
    let hayQueRecolocar = false;

    // Primero las que ya están: cambian de tamaño, color y grafía, nunca de sitio.
    for (const palabra of palabras) {
      const puesta = puestas.get(palabra.clave);
      if (!puesta) continue;
      puesta.el.style.color = tono(palabra.conteo, maximo);

      // La grafía mostrada es la que más alumnos escribieron, así que puede
      // cambiar con cada voto nuevo. Sin esto, la primera forma que llegó se
      // quedaba en pantalla para siempre: "simetria" en vez de "simetría".
      const cambioLaGrafia = puesta.el.textContent !== palabra.texto;
      if (cambioLaGrafia) puesta.el.textContent = palabra.texto;

      if (!cambioLaGrafia && palabra.conteo === puesta.conteo) continue;

      const tamano = tamanoFuente(palabra.conteo, geometria.unidad);
      puesta.el.style.fontSize = `${tamano}px`;
      Object.assign(puesta, medirTexto(palabra.texto, tamano), { conteo: palabra.conteo });
    }

    const ocupadas = [...puestas.values()].map(({ x, y, ancho, alto }) => ({ x, y, ancho, alto }));
    for (let i = 0; i < ocupadas.length && !hayQueRecolocar; i++) {
      for (let j = i + 1; j < ocupadas.length; j++) {
        if (chocan(ocupadas[i], ocupadas[j])) {
          hayQueRecolocar = true;
          break;
        }
      }
    }

    // Después las nuevas, en el primer hueco libre.
    if (!hayQueRecolocar) {
      const nuevas = palabras
        .filter((p) => !puestas.has(p.clave))
        .sort((a, b) => b.conteo - a.conteo);

      for (const palabra of nuevas) {
        // Se mide antes de crear nada: si no cabe, no se toca el DOM.
        const tamano = tamanoFuente(palabra.conteo, geometria.unidad);
        const caja = medirTexto(palabra.texto, tamano);
        const hueco = buscarHueco(caja, ocupadas, geometria);
        if (!hueco) {
          hayQueRecolocar = true;
          break;
        }
        const el = crearElemento(palabra);
        el.style.fontSize = `${tamano}px`;
        el.style.color = tono(palabra.conteo, maximo);
        ubicar(el, hueco.x, hueco.y);
        el.classList.add('palabra--entra');
        puestas.set(palabra.clave, { el, ...hueco, ...caja, conteo: palabra.conteo });
        ocupadas.push({ ...hueco, ...caja });
      }
    }

    if (!hayQueRecolocar) return;

    // Algo dejó de caber: se recoloca todo, encogiendo si hace falta.
    for (const palabra of palabras) {
      if (!puestas.has(palabra.clave)) {
        const el = crearElemento(palabra);
        puestas.set(palabra.clave, { el, x: 0, y: 0, ancho: 0, alto: 0, conteo: 0 });
      }
    }
    for (let intento = 0; intento < 8; intento++) {
      if (recolocarTodo(palabras, geometria, maximo)) return;
      escala *= 0.85;
    }
  }

  function limpiar() {
    for (const { el } of puestas.values()) el.remove();
    puestas.clear();
    escala = 1;
  }

  return { actualizar, limpiar, get cantidad() { return puestas.size; } };
}
