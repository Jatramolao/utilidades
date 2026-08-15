# Agrupación con IA — diseño

**Fecha:** 2026-08-14 · **Estado:** aprobado por Juan, sin implementar

Tercera spec del proyecto. Las dos anteriores son
[`2026-08-07-nube-palabras-design.md`](2026-08-07-nube-palabras-design.md) (el sistema) y
[`2026-08-08-pantalla-proyectada-design.md`](2026-08-08-pantalla-proyectada-design.md) (v1.1).

---

## 1. El problema

La nube comunica una sola cosa, y la comunica bien: **el tamaño dice cuántas veces apareció un
término.** Eso funciona cuando los alumnos responden con palabras sueltas. Un curso de 30 que
contesta «¿qué controla la profundidad de campo?» produce ocho o diez términos con conteos de 12,
7, 5, 3 — y la nube se lee desde la última fila.

Cuando responden con **frases**, no. `MAX_LARGO` son 30 caracteres y cada alumno manda hasta 3
respuestas: un curso de 30 puede producir hasta 90 entradas, casi todas distintas entre sí.
*"la apertura del diafragma"*, *"el tamaño del diafragma"*, *"qué tan abierto está el lente"* son
tres respuestas con conteo 1 cada una. **Una nube donde todo vale 1 no es una nube: es un muro de
texto del mismo tamaño**, y el panel de las 5 más repetidas muestra `1, 1, 1, 1, 1`.

La entrada del 2026-08-08 en [`BITACORA.md`](../../../BITACORA.md) registra que los alumnos
escribieron frases. Registra también que la actividad funcionó. **Lo que no registra es el número
que zanjaría el asunto** —cuántas respuestas distintas salieron de cuántos alumnos—, porque el
campo de datos quedó por anotar. Este diseño se hace con esa incertidumbre encima y está pensado
para no depender de cómo se resuelva.

## 2. Qué se construye

Un botón en la pantalla proyectada que, con la votación ya cerrada, manda la pregunta y las
respuestas a un modelo de lenguaje y recibe **grupos**: conjuntos de respuestas que dicen lo mismo.

La nube pasa a mostrar un término por grupo, con la suma de los conteos. Lo que no entra en ningún
grupo queda intacto.

Un mismo mecanismo cubre los dos regímenes, que es lo que importa: **el profesor no sabe de
antemano si el curso va a responder con palabras o con frases, y con este diseño no necesita
saberlo.**

| Si responden… | Los grupos son… | Ejemplo |
|---|---|---|
| Palabras sueltas | Variantes de escritura y sinónimos | `diafragma` ← `diafrahma`, `diafragmas` |
| Frases | Conceptos | `diafragma` ← `la apertura del diafragma`, `qué tan abierto está el lente` |

Corregir una errata deja de ser una función aparte: es un grupo de dos miembros.

### El dominio no está fijado

La herramienta es de docencia y **el contenido cambia según el ramo**. Los ejemplos de esta spec
alternan a propósito entre fotografía e ingeniería en informática, que son los dos que Juan dicta
hoy, pero nada del diseño asume un dominio: la única fuente de contexto es el texto de la pregunta
que el propio profesor escribió.

En informática las respuestas van a traer **siglas** (API, SQL, GET, TCP), **términos técnicos en
inglés** conviviendo con su equivalente en castellano («array» y «arreglo», «loop» y «bucle»), y a
veces **tokens de código** (`for`, `null`). Las reglas del §7 y del §8 están escritas para eso.

### Por qué esto necesita un modelo

`normalizar.js` ya agrupa lo que se puede agrupar sin entender nada: mayúsculas, tildes,
puntuación. Y se niega a fusionar singular y plural porque destrozaría «análisis», «crisis»,
«síntesis» y «lunes» — sin contexto, es la decisión correcta.

Agrupar *"qué tan abierto está el lente"* con *"diafragma"* exige saber de qué trata la pregunta.
Es la única función del sistema que necesita entender el contenido, y por eso es la única que
justifica un modelo.

De paso resuelve `M-01` (fusionar dos términos a mano) y `M-04` (palabras vacías), que llevaban
tiempo en el backlog esperando evidencia.

---

## 3. Decisiones tomadas

Todas con Juan, el 2026-08-14, antes de escribir una línea.

| Decisión | Elegida | Descartada |
|---|---|---|
| Qué hace | Agrupar respuestas que dicen lo mismo | Reportar los conceptos esperados que faltaron |
| Salida | Un solo concepto: `grupos` | Dos salidas separadas: `correcciones` + `cercanias` |
| Nombre del grupo | Una de las respuestas del grupo | Un término que resuma, elegido por el modelo |
| Si agrupa mal | Botón de deshacer | Recargar la página |
| Cuándo corre | Botón en clase, con la votación cerrada; aplica a la nube | Solo un panel; después de clase |
| Modelo | `claude-sonnet-5` | Haiku 4.5, Opus 5 |
| Cómo se llama a la API | `fetch` directo | SDK oficial de Anthropic |
| Dónde vive el resultado | En memoria, en la pantalla del profesor | Escrito en Redis |

**Sobre la salida única.** El primer diseño separaba corregir ortografía de encontrar cercanías.
Se descartó porque optimizaba el caso menos probable: fusionar erratas sirve para sumar conteos, y
con frases no hay conteos que sumar. Agrupar es un superconjunto de corregir, con una sola forma de
salida y un solo tratamiento en pantalla.

**Sobre el nombre del grupo.** Que sea siempre una respuesta real conserva la propiedad más
importante del sistema: **en el proyector nunca aparece una palabra que ningún alumno escribió.**
Un nombre inventado por el modelo la rompería.

**Sobre no juzgar conceptos.** Se evaluó y se descartó que la IA marcara respuestas equivocadas.
La nube se proyecta delante del curso: una IA que señala una respuesta como errónea señala a
alguien que, aunque sea anónimo, se reconoce — y a veces se equivoca ella.

**Sobre declarar conceptos esperados.** Habría dado el análisis más rico —decir qué concepto nadie
mencionó— pero exige escribir tres o cuatro términos cada vez que se lanza una pregunta. La
herramienta existe porque lanzar una pregunta cuesta diez segundos.

---

## 4. Experiencia en sala

Con la votación cerrada, junto al panel de las 5 más repetidas aparece un botón **Agrupar**.

Al pulsarlo pasa a *"Agrupando…"* y queda inhabilitado. Dos a cuatro segundos después:

1. **La nube se reordena.** Cada grupo aparece como un solo término, del tamaño que le corresponde
   por la suma de sus miembros. Los miembros desaparecen con el mismo latido que ya usa la nube al
   subir un conteo. No hay animación nueva.
2. **El panel de conteos se enriquece.** Cada término del top 5 que sea un grupo gana una línea
   debajo: `diafragma 14 — reúne: diafrahma, la apertura del diafragma`.
3. **El botón cambia a "Ver respuestas tal cual".** Un clic vuelve a la nube cruda; otro reaplica
   el mismo agrupamiento, sin volver a llamar a la API.

Si el modelo no encuentra grupos, el botón dice *"nada que agrupar"* unos segundos y vuelve a su
estado normal. No es un error.

Si algo falla, aparece una línea gris — *"No se pudo agrupar. Volvé a pulsar."* — y la nube queda
exactamente como estaba. **O se aplica el plan completo o no se aplica nada.**

### El deshacer no es un detalle

Agrupar es juicio, no cálculo: dos corridas sobre las mismas respuestas pueden agrupar distinto, y
a veces va a agrupar mal. El deshacer es lo que vuelve aceptable ese riesgo — el costo de una
agrupación mala pasa a ser un clic, no recargar la página delante del curso. Volver a pulsar
**Agrupar** reagrupa desde cero, que en la práctica funciona como un segundo intento.

Cuesta diez líneas: el plan vive en memoria, deshacer es ponerlo en `null` y repintar.

### Lo que no se hace, y por qué

- **No se colorea la nube por grupo.** `tono.js` mapea luminosidad a conteo, calibrado a ≥4,5:1 de
  contraste y verificado en pruebas. Si el color pasa a significar «grupo», el lector de la última
  fila pierde la única señal que la nube transmite bien: tamaño y tono significan frecuencia.
- **No hay un panel de grupos aparte.** Sería una tercera tarjeta peleando por la franja inferior
  con el QR y los conteos, que es donde aparecieron tres bugs de solapamiento en producción.
- **La agrupación nunca la dispara el sondeo de 2 segundos.** La regla dura de la pantalla
  proyectada —una palabra ya en pantalla no se mueve, solo escala— se mantiene porque agrupar es
  un evento único y deliberado del profesor.

---

## 5. Arquitectura

Dos archivos nuevos, ambos pequeños, y ninguna dependencia npm.

| Archivo | Responsabilidad |
|---|---|
| `api/_lib/ia.js` | Arma el prompt, llama a Anthropic con `fetch`, valida los grupos. Exporta `armarPrompt` y `validarGrupos` por separado de la llamada, para poder probarlos sin red. |
| `js/plan.js` | Función pura `aplicarGrupos(palabras, grupos)`. Sin DOM, sin red. |

Modificados: `api/_lib/rutas.js` (una acción y una rama de enrutamiento), `js/profesor.js` (botón,
estado, aplicación al pintar), `css/estilo.css` (el botón y la línea de "reúne").

El proyecto sigue con cero dependencias, cero `node_modules`, cero paso de build. Se usa `fetch`
igual que `store-redis.js` con Upstash.

---

## 6. Contrato de la ruta

```
POST /api/sala/:codigo/pregunta/:n/agrupar
Cabecera: x-token-profesor
Cuerpo: (vacío)
```

**El cliente no manda datos.** El servidor lee la pregunta y los conteos de Redis con la misma
lógica que ya usa `verNube`. Así nadie puede mandar cuatro mil respuestas inventadas para quemar
presupuesto, y los grupos siempre se calculan sobre el estado real.

**Autorización: `exigirProfesor`**, la misma que protege cerrar la votación y borrar palabras. Solo
quien creó la sala puede gastar. El límite por IP existente (`MAX_ENVIOS_POR_IP`) queda como
segundo cinturón, más un tope de 30 agrupaciones por sala en las 6 horas de TTL, con el mismo
`incrConTtl` que ya usa el sistema.

**Respuesta 200:**

```json
{
  "grupos": [
    { "nombre": "diafragma",
      "miembros": ["diafragma", "diafrahma", "la apertura del diafragma"] },
    { "nombre": "distancia al sujeto",
      "miembros": ["distancia al sujeto", "qué tan cerca está"] }
  ]
}
```

**Todos los campos son grafía visible**, no claves normalizadas: es lo que el modelo vio en el
prompt y lo único que puede devolver con sentido. El servidor traduce cada miembro a su `clave`
usando el mismo mapa que armó el prompt; lo que no se pueda traducir se descarta.

**Errores:** 403 sin token de profesor, 404 sala o pregunta inexistente, 429 tope alcanzado, 502 si
Anthropic falla o devuelve algo inválido. Nunca se devuelve un resultado a medias.

---

## 7. El prompt

Vive como una constante al inicio de `api/_lib/ia.js`, en un solo lugar, para que ajustarlo no sea
tocar lógica.

### Instrucción de sistema

> Sos el asistente de una herramienta de aula. Un docente proyectó una pregunta y sus alumnos
> respondieron de forma anónima, con palabras sueltas o frases cortas. El resultado se ve como una
> nube de palabras en un proyector, donde el tamaño de cada término indica cuántas veces apareció.
>
> El problema que resolvés: cuando los alumnos responden con frases, casi todas son distintas entre
> sí, todo aparece del mismo tamaño y la nube deja de comunicar nada. Tu trabajo es reunir las
> respuestas que dicen lo mismo, para que la nube vuelva a mostrar qué pensó el curso.
>
> Devolvé grupos. Cada grupo reúne respuestas que expresan la misma idea dentro de esta pregunta:
> la misma palabra mal escrita, singular y plural, sinónimos, un término y su equivalente en
> inglés, o frases distintas que dicen lo mismo.
>
> Cada grupo lleva un nombre, y **el nombre tiene que ser una de las respuestas del grupo** — la
> más clara y breve de ellas. No inventes un término: lo que pongas como nombre es lo que se va a
> proyectar, y solo puede aparecer en el proyector algo que un alumno haya escrito.
>
> Seis reglas:
> - Nunca juzgues si una respuesta es correcta o incorrecta. No es tu tarea, y esto se proyecta
>   delante del curso.
> - Agrupá solo cuando estés seguro. Ante la duda, dejá la respuesta suelta: una nube con dos
>   términos parecidos es mejor que una nube que junta dos ideas distintas.
> - Que dos respuestas compartan tema no las hace lo mismo. «arreglo» y «lista enlazada» son
>   estructuras distintas; «diafragma» y «obturador» son controles distintos.
> - Cada respuesta va en un solo grupo.
> - Las respuestas pueden traer siglas (API, SQL, GET), términos en inglés, nombres de herramientas
>   o lenguajes, y fragmentos de código. No agrupes dos siglas distintas entre sí: GET y SET, PUT y
>   POST, TCP y UDP son cosas diferentes. Sí podés agrupar una sigla con su nombre desarrollado.
> - No hace falta que todas las respuestas queden agrupadas. Dejá fuera lo que no pertenezca a
>   ningún grupo, y devolver pocos grupos —o ninguno— es una respuesta válida y frecuente.

### Mensaje del usuario

Armado por el servidor con lo que hay en Redis. Dos ejemplos de ramos distintos, para dejar claro
que el prompt no sabe de qué materia se trata más allá de lo que dice la pregunta.

**Respuestas en frases** — el caso que motiva este diseño:

```
Pregunta proyectada: "¿Qué controla la profundidad de campo?"

Respuestas y cuántas veces apareció cada una:
diafragma — 4
la apertura del diafragma — 1
qué tan abierto está el lente — 1
diafrahma — 1
distancia al sujeto — 2
qué tan cerca está — 1
la distancia focal — 1
el zoom — 1
```

Agrupamiento correcto: **diafragma** reúne las cuatro primeras (conteo 7); **distancia al sujeto**
reúne las dos siguientes (conteo 3); *la distancia focal* y *el zoom* quedan sueltas — son otro
control, aunque estén relacionadas.

**Respuestas en palabras**, con vocabulario de informática:

```
Pregunta proyectada: "¿Qué estructura usarías para una cola de tareas?"

Respuestas y cuántas veces apareció cada una:
cola — 9
queue — 6
arreglo — 4
lista enlazada — 3
cola de prioridad — 2
arreglo dinamico — 2
```

Agrupamiento correcto: **cola** reúne a *queue* (conteo 15); **arreglo** reúne a *arreglo dinamico*
(conteo 6). *lista enlazada* y *cola de prioridad* quedan sueltas: son estructuras distintas, no
sinónimos.

### Parámetros de la llamada

```
POST https://api.anthropic.com/v1/messages
x-api-key: $ANTHROPIC_API_KEY
anthropic-version: 2023-06-01

model: "claude-sonnet-5"
max_tokens: 2048
thinking: { "type": "adaptive" }
output_config: { "effort": "low", "format": { "type": "json_schema", "schema": … } }
```

**Salidas estructuradas** con esquema JSON, así la respuesta viene garantizada como JSON parseable
— no hay que reintentar por texto mal formado. La primera pulsada de cada día es algo más lenta
porque el esquema se compila; después queda en caché 24 horas.

`effort: "low"` porque la tarea es acotada y en sala los segundos se notan; si el agrupamiento sale
pobre, subir a `medium` es cambiar una palabra.

---

## 8. Validación de los grupos

Cinco reglas en el servidor, antes de devolver nada. Son lo que impide que aparezca en el proyector
algo que nadie escribió, o que dos ideas distintas queden fundidas.

1. **Existencia.** Todo miembro tiene que existir en los conteos reales. Los que no existan se
   descartan en silencio.
2. **El nombre tiene que ser un miembro.** Si el modelo devuelve un nombre que no está entre los
   miembros, no se descarta el grupo: **se reemplaza el nombre por el miembro de mayor conteo**,
   con desempate alfabético por `clave`. Salva un agrupamiento bueno con un nombre desprolijo, sin
   ceder en lo esencial — el nombre sigue siendo algo que un alumno escribió.
3. **Mínimo dos miembros.** Un grupo que queda con uno solo tras la regla 1 no hace nada: se
   descarta.
4. **Un término, un grupo.** Si un término aparece en dos grupos, se conserva en el primero y se
   quita de los demás. Evita que el resultado dependa del orden de aplicación.
5. **Una sigla por grupo.** Si un grupo contiene dos términos cuya grafía original es toda
   mayúsculas y tiene 2 caracteres o más, el grupo se descarta entero. Bloquea de raíz el caso que
   más va a aparecer en informática: `GET` con `SET`, `PUT` con `POST`, `TCP` con `UDP`. Una sigla
   junto a su nombre desarrollado (`API` con `interfaz de programación`) sí pasa, porque el segundo
   término no es mayúsculas.

Si tras validar no queda ningún grupo, se devuelve `{"grupos": []}` con estado 200.

**Lo que estas reglas no cubren.** Nada impide que el modelo junte dos frases que a él le parecen
lo mismo y a Juan no. La validación garantiza que lo proyectado sea real y que las siglas queden
intactas; **no puede garantizar que el criterio sea bueno.** Esa es la razón por la que existe el
deshacer y por la que este diseño no escribe nada en Redis.

---

## 9. Aplicación en el cliente

`js/plan.js` exporta una función pura:

```js
aplicarGrupos(palabras, grupos) → palabras
```

`palabras` es lo que ya devuelve `GET …/nube`: `[{ clave, texto, conteo }]`. La función:

- suma los conteos de todos los miembros de cada grupo,
- usa el `nombre` del grupo como `texto` y su `clave` como clave,
- elimina de la lista a los demás miembros,
- deja intacto lo que no pertenece a ningún grupo,
- reordena por conteo, con el mismo desempate alfabético por `clave` que usa `verNube`, para que el
  resultado sea estable entre repintados.

**Los grupos viven en `profesor.js` como estado en memoria y se reaplican en cada pintado.** Si
llegan respuestas nuevas —o si el sondeo sigue corriendo— se les siguen aplicando sin volver a
llamar a la API; una respuesta nueva que no esté en ningún grupo simplemente aparece suelta. Si se
recarga la página, vuelve la nube cruda: **Redis nunca se toca, y lo que respondieron los alumnos
queda intacto.**

---

## 10. Errores y casos borde

| Caso | Comportamiento |
|---|---|
| Sin `ANTHROPIC_API_KEY` en el entorno | 502, mensaje en pantalla, nube intacta |
| Anthropic devuelve 429 o 5xx | 502, *"No se pudo agrupar. Volvé a pulsar."* Sin reintento automático |
| Respuesta que no valida contra el esquema | 502. No se aplica nada parcial |
| Grupos válidos pero lista vacía | 200, *"nada que agrupar"* |
| Sala o pregunta expirada a mitad de camino | 404, mensaje normal de sala inexistente |
| Se pulsa Agrupar dos veces | El botón queda inhabilitado mientras corre |
| Llega una respuesta nueva tras agrupar | Aparece suelta; los grupos existentes se mantienen |
| Se agrupa, luego se lanza otra pregunta | Los grupos se descartan: son por pregunta, no por sala |
| Modo nocturno | La línea de "reúne" usa la rampa de `tono.js`, sin color propio |

**No hay reintento automático a propósito.** El SDK lo daría gratis, pero se descartó el SDK para
conservar cero dependencias. El botón se vuelve a pulsar, que en una sala es más rápido y más
predecible que una espera silenciosa que se alarga.

---

## 11. Pruebas

**Puras, con `node --test`** (`test/plan.test.js`, `test/ia.test.js`):

- `aplicarGrupos` suma conteos y usa el nombre del grupo como texto.
- `aplicarGrupos` con lista vacía devuelve las palabras idénticas.
- `aplicarGrupos` deja intacto lo que no pertenece a ningún grupo.
- El orden resultante es estable ante empates.
- La validación descarta miembros que no están en los conteos.
- La validación reemplaza un nombre que no es miembro por el miembro de mayor conteo.
- La validación descarta un grupo que queda con un solo miembro.
- La validación quita un término repetido del segundo grupo, no del primero.
- La validación descarta un grupo con dos siglas: `GET` + `SET`, `TCP` + `UDP`.
- La validación acepta `API` + `interfaz de programación`.
- `rutas.test.js`: 403 sin token de profesor; 404 con sala inexistente; tope por sala.

**Ciclo de `/pruebas`:** una llamada real a la API, también cuando se apunta a producción. Cuesta
un centavo de dólar por corrida y es deliberado — apuntar `/pruebas` a producción es lo que
encontró 3 de los 4 bugs que solo aparecían desplegado, y el camino que solo falla desplegado
(clave ausente, variable de entorno mal nombrada, CORS) no se cubre de otra forma.

---

## 12. Qué queda fuera a propósito

- **Declarar conceptos esperados.** Cuesta quince segundos por pregunta.
- **Juicio conceptual sobre respuestas.** Proyecta un juicio sobre alguien.
- **Persistir los grupos en Redis.** Un agrupamiento equivocado quedaría clavado, y la escritura
  correría contra el sondeo de 2 segundos.
- **Editar un grupo a mano.** Deshacer y volver a pulsar cubre el caso con diez líneas en vez de
  una interfaz de edición sobre el proyector.
- **Que el alumno vea los grupos en su teléfono.** Obligaría a que 30 teléfonos consulten de fondo,
  decisión ya rechazada en la spec original.
- **Streaming de la respuesta.** Tres segundos no lo necesitan, y agregaría manejo de SSE.
- **Historial de agrupaciones.** El TTL de 6 horas se lleva todo, como el resto del sistema.

**Regla de gobierno vigente:** si aparece una necesidad docente nueva que no sea una nube de
palabras, se construye como otra herramienta pequeña en `utilidades/`, nunca como una función más
de esta.

---

## 13. Costo

Cada pulsada manda ~650 tokens de entrada y recibe ~400 de salida. Con `claude-sonnet-5` a US$3 y
US$15 por millón:

| | |
|---|---|
| Por pulsada | ~US$0,008 |
| Tope por sala (30 agrupaciones) | US$0,24 |
| Semestre (5 preguntas × 4 clases × 15 semanas) | ~US$2,40 |
| Corrida completa de `/pruebas` | US$0,008 |

El costo no es una restricción de diseño. La latencia sí: por eso Sonnet y no Opus, y `effort` en
`low`.

---

## 14. Umbrales que este cambio cruza

Cuatro cosas que hasta hoy el proyecto no tenía. Quedan anotadas porque son las que hay que revisar
si algo se rompe.

1. **Un secreto.** `ANTHROPIC_API_KEY` como variable de entorno en Vercel. Se usa solo dentro de la
   función serverless; nunca llega al navegador.
2. **Un costo por uso.** Acotado arriba y con tope por sala.
3. **Una salida de datos a un tercero.** Las respuestas de los alumnos viajan a la API de
   Anthropic. Son palabras y frases cortas, anónimas, sin nombre ni identificador. **Si Duoc UC
   tiene política sobre enviar producción de estudiantes a un servicio de IA, esa política manda
   sobre esta spec.** Pendiente de confirmar con Juan.
4. **Segundos de espera en vivo.** El primer punto del sistema donde el proyector espera delante
   del curso. Mitigado con `effort` bajo y con estado visible en el botón.

---

## 15. Lo que sigue sin saberse

Este diseño se hizo sobre una suposición razonada, no sobre un dato: que las respuestas en frases
degradan la nube lo suficiente como para justificar agrupar. **El número que lo confirmaría o lo
desmentiría es cuántas respuestas distintas produjo el curso frente a cuántos alumnos**, y sigue
sin anotarse.

Si en la próxima clase sale que 30 alumnos produjeron 12 términos distintos con conteos repartidos,
esta función es un lujo y conviene no construirla. Si producen 60 términos con conteo 1, es lo más
valioso del backlog.

**Anotarlo en la bitácora vale más que cualquier ajuste a esta spec.**
