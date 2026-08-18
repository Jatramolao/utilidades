/**
 * Lectura semántica de las respuestas, con la API de Claude.
 *
 * Se habla HTTP con `fetch`, sin cliente ni dependencias de npm: es una sola
 * llamada, igual que con Upstash en `store-redis.js`.
 *
 * Lo que este módulo NO hace, y es deliberado: no toca la nube. Devuelve prosa
 * que vive en su propio panel. Por eso no hay validación de términos, ni
 * fusión de conteos, ni nada que pueda alterar lo que escribieron los alumnos.
 *
 * `armarPrompt` y `recortar` son puros y se prueban sin red. `crearLector`
 * recibe el `fetch` por parámetro para poder probar la forma de la petición.
 */

export const MODELO = 'claude-sonnet-5';
/*
 * 600 y no 400: medido contra la API real, tres lecturas de tres salieron
 * truncadas con 400, y el corte se comía siempre la última frase — que es
 * justo la observación que el prompt pide (la minoría que aporta algo). Tres
 * frases sustantivas en castellano pasan los 400 caracteres con facilidad.
 */
export const MAX_LECTURA = 600;
export const URL_API = 'https://api.anthropic.com/v1/messages';
export const VERSION_API = '2023-06-01';

/** Marca el fallo por credencial ausente, para poder explicarlo distinto. */
export const FALTA_CLAVE = 'Falta la clave de la API de Claude';

/**
 * La instrucción está escrita contra un riesgo concreto: que el panel diga
 * "la más votada fue X con 7". Eso el docente ya lo tiene en pantalla en
 * letras grandes, y si la lectura repite la nube, no vale la latencia.
 *
 * La regla del patrón ausente pesa tanto como las cuatro cosas que se piden:
 * a un modelo al que le pedís interpretar, interpreta — le encuentra sentido
 * al ruido para no parecer inútil.
 */
export const INSTRUCCION = `Sos el asistente de una herramienta de aula. Un docente proyectó una pregunta y sus alumnos respondieron de forma anónima, con palabras sueltas o frases cortas. El docente ya está viendo una nube de palabras donde el tamaño de cada respuesta indica cuántas veces apareció.

Tu tarea es escribir, en dos o tres frases, qué está diciendo el curso.

No enumeres las respuestas ni digas cuál fue la más votada: eso el docente lo tiene en pantalla, en letras grandes, desde antes de leerte. Escribí lo que la nube no puede mostrar:

- Si respuestas escritas de forma distinta convergen en una misma idea, y cuál es esa idea.
- Si el curso está dividido en dos o más lecturas distintas, y cuáles son.
- Si hay una idea que varias respuestas rodean sin llegar a nombrar.
- Si una minoría dice algo que vale la pena mirar.

Seis reglas:
- Nunca digas si una respuesta es correcta o incorrecta. Describís lo que el curso piensa, no lo evaluás. Esto se proyecta delante del curso.
- Cuando menciones una respuesta, citala tal como la escribieron los alumnos.
- Centrá la lectura en lo más repetido. Mencioná una respuesta poco frecuente solo si aporta algo que las demás no dicen.
- Si las respuestas no tienen un patrón claro, decilo en una frase y terminá ahí. Es una lectura válida y es mejor que inventar una coherencia que no está.
- Las respuestas pueden traer siglas, términos técnicos en inglés, nombres de herramientas o lenguajes, y fragmentos de código. No los traduzcas ni los corrijas.
- Dos o tres frases, en castellano neutro. Sin encabezados, sin viñetas, sin consejos de pedagogía, sin felicitar al curso.`;

const ESQUEMA = {
  type: 'object',
  properties: { lectura: { type: 'string' } },
  required: ['lectura'],
  additionalProperties: false,
};

/**
 * Mensaje del usuario. El orden es descendente por conteo con desempate
 * alfabético —el mismo que usa la nube— para que dos llamadas con el mismo
 * estado produzcan el mismo prompt y la caché sirva.
 *
 * @param {string} pregunta
 * @param {{clave: string, texto: string, conteo: number}[]} palabras
 */
export function armarPrompt(pregunta, palabras) {
  const ordenadas = [...palabras].sort(
    (a, b) => b.conteo - a.conteo || a.clave.localeCompare(b.clave),
  );
  const lineas = ordenadas.map((p) => `${p.texto} — ${p.conteo}`);
  return [
    `Pregunta proyectada: "${pregunta}"`,
    '',
    'Respuestas y cuántas veces apareció cada una:',
    ...lineas,
  ].join('\n');
}

/**
 * Recorta a un largo máximo cortando en un límite de palabra: una frase
 * partida a mitad de sílaba proyectada es peor que una frase de menos.
 */
export function recortar(texto, maximo = MAX_LECTURA) {
  const limpio = String(texto ?? '').replace(/\s+/g, ' ').trim();
  if (limpio.length <= maximo) return limpio;

  const cortado = limpio.slice(0, maximo - 1);
  const ultimoEspacio = cortado.lastIndexOf(' ');
  const base = ultimoEspacio > maximo / 2 ? cortado.slice(0, ultimoEspacio) : cortado;
  return `${base.replace(/[.,;:\s]+$/, '')}…`;
}

/** Resuelve la credencial o falla con un mensaje que dice qué falta. */
export function leerClave(entorno = process.env) {
  const clave = entorno.ANTHROPIC_API_KEY;
  if (!clave) {
    throw new Error(
      `${FALTA_CLAVE}. Agrega ANTHROPIC_API_KEY en las variables de entorno y vuelve a desplegar.`,
    );
  }
  return clave;
}

/**
 * @param {object} [opciones]
 * @param {string} [opciones.clave]
 * @param {typeof fetch} [opciones.buscar]  inyectable para probar sin red
 */
export function crearLector({ clave, buscar = fetch, entorno = process.env } = {}) {
  const credencial = clave ?? leerClave(entorno);

  return {
    async leer(pregunta, palabras) {
      const respuesta = await buscar(URL_API, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': credencial,
          'anthropic-version': VERSION_API,
        },
        body: JSON.stringify({
          model: MODELO,
          max_tokens: 2048,
          system: INSTRUCCION,
          thinking: { type: 'adaptive' },
          output_config: {
            effort: 'low',
            format: { type: 'json_schema', schema: ESQUEMA },
          },
          messages: [{ role: 'user', content: armarPrompt(pregunta, palabras) }],
        }),
      });

      if (!respuesta.ok) {
        throw new Error(`La API de Claude respondió ${respuesta.status}`);
      }

      const datos = await respuesta.json();

      // Una negativa del clasificador llega como 200 con stop_reason refusal y
      // content vacío: sin este caso el síntoma sería un error de parseo.
      if (datos.stop_reason === 'refusal') {
        throw new Error('La API de Claude declinó responder a esta pregunta');
      }

      const bloque = (datos.content ?? []).find((b) => b?.type === 'text');
      if (!bloque?.text) throw new Error('La API de Claude no devolvió texto');

      let contenido;
      try {
        contenido = JSON.parse(bloque.text);
      } catch {
        throw new Error('La API de Claude devolvió algo que no es JSON');
      }
      if (typeof contenido.lectura !== 'string' || contenido.lectura.trim() === '') {
        throw new Error('La API de Claude devolvió una lectura vacía');
      }

      return recortar(contenido.lectura);
    },
  };
}

/**
 * Lector enlatado para desarrollo local sin clave, igual que `store-memoria`
 * cuando no hay Redis. Lo elige `dev.js` a propósito; `api/index.js` nunca lo
 * construye, así que no hay forma de que aparezca en producción.
 */
export function crearLectorFalso() {
  return {
    async leer(pregunta, palabras) {
      const top = [...palabras].sort((a, b) => b.conteo - a.conteo)[0];
      return recortar(
        `[lectura de desarrollo, sin llamar a la API] El curso responde a «${pregunta}» ` +
          `con ${palabras.length} respuestas distintas, y la más repetida es «${top?.texto ?? '—'}». ` +
          'Con una clave de API real, acá iría la interpretación semántica.',
      );
    },
  };
}
