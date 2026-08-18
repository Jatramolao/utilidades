# Análisis semántico y lectura contra objetivos — diseño

**Fecha:** 2026-08-14 · **Estado:** aprobado por Juan, sin implementar

Tercera spec del proyecto. Las dos anteriores son
[`2026-08-07-nube-palabras-design.md`](2026-08-07-nube-palabras-design.md) (el sistema) y
[`2026-08-08-pantalla-proyectada-design.md`](2026-08-08-pantalla-proyectada-design.md) (v1.1).

---

## 1. El encargo

Una **capa adicional de procesamiento** sobre la nube de palabras que ya está en producción. Corre
después de recolectar las respuestas, dentro de la misma sesión de clase. Hace dos cosas:

1. **Analiza semánticamente** el conjunto de respuestas: agrupa conceptos parecidos aunque estén
   escritos con palabras distintas, y detecta relaciones entre esos grupos.
2. **Genera una lectura en lenguaje natural** que compara lo que respondió el curso contra los
   **objetivos de aprendizaje de la clase**, que el docente ingresa antes: qué conceptos clave
   aparecieron, cuáles no aparecieron pese a ser relevantes, y qué tan alineadas están las
   respuestas con lo planeado.

## 2. Qué no cambia

Restricciones explícitas del encargo, anotadas para que ninguna decisión posterior las erosione:

- **La interfaz y el flujo del alumno no se tocan.** Mismo QR, mismo formulario, mismas hasta tres
  respuestas de hasta 30 caracteres. Nada de esta spec llega al teléfono de un alumno.
- **No se construye una herramienta nueva.** Es una capa sobre la nube existente, no un reemplazo.
- **No hay persistencia entre clases.** Los objetivos viven en el mismo hash de Redis que la sala,
  con el mismo TTL de 6 horas, y se borran solos con todo lo demás. No aparece base de datos,
  historial ni cuenta de usuario.
- **La nube sigue siendo la vista principal.** El mapa de conexiones es una **segunda vista** a la
  que el profesor cambia. El encargo dice *"en lugar de solo mostrar tamaño según frecuencia"*, y
  se lee como *además de*, no *en vez de*.

---

## 3. Las dos fases

Acordado con Juan el 2026-08-14. El encargo marca el mapa visual como *"idealmente"*, así que se
separa de lo que se puede usar en clase antes.

| Fase | Qué entra | Por qué en ese orden |
|---|---|---|
| **1** | Objetivos de clase, agrupación semántica aplicada a la nube existente, y la lectura contra objetivos | Es todo el valor conceptual y reusa la pantalla que ya existe. Se puede usar en clase apenas esté. |
| **2** | La vista de mapa con las conexiones entre grupos | Se diseña sabiendo cómo se ven los grupos reales de los cursos de Juan, en vez de suponerlo. |

La llamada al modelo de la Fase 1 **ya devuelve las conexiones**, aunque nada las dibuje todavía.
Así la Fase 2 no obliga a cambiar el contrato ni a volver a tocar el prompt.

---

## 4. El problema que resuelve la inferencia de objetivos

Los objetivos son **de la clase**, pero el análisis corre **por pregunta**, y en una sesión se
lanzan cinco. Comparar cada pregunta contra los cuatro objetivos de la clase produciría
*"faltaron los objetivos 2, 3 y 4"* en las cinco preguntas — porque esa pregunta no era sobre
ellos. La sección más valiosa se volvería ruido en la primera clase.

**El modelo infiere a qué objetivos apunta esa pregunta** y solo reporta sobre esos. Tiene el texto
de la pregunta y el de los objetivos delante; es exactamente el tipo de juicio que sabe hacer, y no
cuesta un segundo de trabajo del profesor.

La alternativa —que Juan etiquete qué objetivo persigue cada pregunta al lanzarla— se descartó:
devuelve la fricción que el sistema entero existe para evitar.

---

## 5. Decisiones tomadas

Todas con Juan, el 2026-08-14, antes de escribir una línea.

| Decisión | Elegida | Descartada |
|---|---|---|
| Alcance | Capa adicional sobre la nube existente | Rediseñar la visualización |
| Orden | Dos fases; el mapa en la segunda | Todo junto; el mapa primero |
| Objetivos de aprendizaje | Los ingresa el docente, una vez por clase | Que el modelo los adivine; no tenerlos |
| A qué objetivo apunta cada pregunta | Lo infiere el modelo | Que el docente lo etiquete al lanzar |
| Salida de la agrupación | `grupos`, cada uno con nombre y miembros | `correcciones` + `cercanias` por separado |
| Nombre del grupo | Una de las respuestas del grupo | Un término que resuma, elegido por el modelo |
| Disposición del mapa | Determinista, en anillo | Simulación de fuerzas |
| Nodos del mapa | Un nodo por grupo | Un nodo por respuesta |
| La lectura en pantalla | Se abre con un botón y la cierra el docente | Aparece sola al terminar el análisis |
| Si agrupa mal | Botón de deshacer | Recargar la página |
| Modelo | `claude-sonnet-5` | Haiku 4.5, Opus 5 |
| Cómo se llama a la API | `fetch` directo | SDK oficial de Anthropic |
| Dónde vive el resultado | En memoria, en la pantalla del profesor | Escrito en Redis |

**Sobre los objetivos.** En una versión anterior de esta spec se descartó "declarar conceptos
esperados" porque costaba quince segundos por pregunta. El encargo los reintroduce, y ahora la
cuenta es otra: **se ingresan una vez por clase**, no una vez por pregunta. Quince segundos
repartidos entre cinco preguntas en lugar de pagados cinco veces.

**Sobre el nombre del grupo.** Que sea siempre una respuesta real conserva la propiedad más
importante del sistema: **en la nube nunca aparece una palabra que ningún alumno escribió.**

**Sobre la lectura y ese principio.** La lectura es prosa generada, y ahí el principio no aplica ni
puede aplicar: habla de los objetivos que escribió el propio docente, no reescribe respuestas de
alumnos. Por eso vive en un panel aparte que el docente abre y cierra, y nunca se mezcla con la
nube.

---

## 6. Fase 1 · Los objetivos de clase

### Entrada

Un botón **Objetivos de la clase** en la barra superior de la sala. Abre un diálogo con un
`textarea`: **un objetivo por línea**, hasta 6 líneas, hasta 500 caracteres en total. Se puede
editar en cualquier momento de la sesión; el análisis usa lo que haya en el momento de pulsar.

El botón muestra un punto cuando hay objetivos cargados, para que se vea de un vistazo sin abrir
el diálogo.

### Almacenamiento

Campo `objetivos` en el hash `sala:{codigo}` que ya existe. Mismo TTL de 6 horas, renovado en cada
escritura como el resto. **No aparece ninguna clave nueva en Redis ni ninguna estructura nueva.**

```
POST /api/sala/:codigo/objetivos
Cabecera: x-token-profesor
Cuerpo: { "texto": "Distinguir apertura de velocidad\nRelacionar…" }
```

Autorización con `exigirProfesor`, la misma que protege cerrar la votación.

### Los objetivos son opcionales

Sin objetivos cargados, el análisis **igual corre**: devuelve grupos y conexiones, y omite la
lectura. El botón de la lectura no aparece. Es deliberado — la agrupación tiene valor por sí sola,
y obligar a escribir objetivos para poder agrupar convertiría una función opcional en un peaje.

---

## 7. Fase 1 · Contrato del análisis

```
POST /api/sala/:codigo/pregunta/:n/analizar
Cabecera: x-token-profesor
Cuerpo: (vacío)
```

**El cliente no manda datos.** El servidor lee la pregunta, los conteos y los objetivos de Redis
con la misma lógica que ya usa `verNube`. Así nadie puede mandar cuatro mil respuestas inventadas
para quemar presupuesto, y el análisis siempre se calcula sobre el estado real.

**Autorización: `exigirProfesor`.** Solo quien creó la sala puede gastar. El límite por IP existente
(`MAX_ENVIOS_POR_IP`) queda como segundo cinturón, más un tope de 30 análisis por sala en las 6
horas de TTL, con el mismo `incrConTtl` que ya usa el sistema.

**Respuesta 200:**

```json
{
  "grupos": [
    { "nombre": "diafragma",
      "miembros": ["diafragma", "diafrahma", "la apertura del diafragma"] },
    { "nombre": "distancia al sujeto",
      "miembros": ["distancia al sujeto", "qué tan cerca está"] }
  ],
  "conexiones": [
    { "de": "diafragma", "a": "distancia al sujeto",
      "relacion": "ambos controlan la profundidad de campo" }
  ],
  "lectura": {
    "objetivosTocados": ["Distinguir los tres controles de la profundidad de campo"],
    "aparecieron": ["apertura del diafragma", "distancia al sujeto"],
    "faltaron": ["distancia focal del lente"],
    "texto": "El curso identificó dos de los tres controles con claridad…"
  }
}
```

`lectura` es `null` cuando no hay objetivos cargados. `conexiones` se devuelve desde la Fase 1
aunque nada la dibuje hasta la Fase 2.

**Todos los términos de `grupos` y `conexiones` son grafía visible**, no claves normalizadas: es lo
que el modelo vio en el prompt. El servidor traduce cada miembro a su `clave` con el mismo mapa que
armó el prompt; lo que no se pueda traducir se descarta.

**Errores:** 403 sin token de profesor, 404 sala o pregunta inexistente, 429 tope alcanzado, 502 si
Anthropic falla o devuelve algo inválido. Nunca se devuelve un resultado a medias.

---

## 8. Fase 1 · El prompt

Vive como una constante al inicio de `api/_lib/ia.js`, en un solo lugar, para que ajustarlo no sea
tocar lógica.

### Instrucción de sistema

> Sos el asistente de una herramienta de aula. Un docente proyectó una pregunta y sus alumnos
> respondieron de forma anónima, con palabras sueltas o frases cortas. El resultado se ve como una
> nube de palabras en un proyector, donde el tamaño de cada término indica cuántas veces apareció.
>
> Tenés tres tareas.
>
> **Agrupar.** Cuando los alumnos responden con frases, casi todas son distintas entre sí, todo
> aparece del mismo tamaño y la nube deja de comunicar. Reuní las respuestas que expresan la misma
> idea dentro de esta pregunta: la misma palabra mal escrita, singular y plural, sinónimos, un
> término y su equivalente en inglés, o frases distintas que dicen lo mismo.
>
> Cada grupo lleva un nombre, y **el nombre tiene que ser una de las respuestas del grupo** — la
> más clara y breve de ellas. No inventes un término: lo que pongas como nombre es lo que se va a
> proyectar, y solo puede aparecer en el proyector algo que un alumno haya escrito.
>
> **Conectar.** Indicá qué grupos se relacionan entre sí dentro de esta pregunta, con una frase muy
> corta que diga por qué. Conectá solo lo que tenga una relación real y explicable; que dos grupos
> compartan tema no es una relación.
>
> **Leer contra los objetivos.** Si el docente cargó objetivos de aprendizaje, decidí primero a
> cuál o cuáles apunta *esta* pregunta —no todos los objetivos de la clase se persiguen en cada
> pregunta— y reportá solo sobre esos. Indicá qué conceptos clave de esos objetivos aparecieron en
> las respuestas, cuáles no aparecieron pese a ser parte del objetivo, y escribí dos o tres frases
> de lectura para el docente.
>
> Siete reglas:
> - Nunca juzgues si la respuesta de un alumno es correcta o incorrecta. Podés decir que un
>   concepto no apareció en el curso; no señales respuestas como equivocadas.
> - Agrupá solo cuando estés seguro. Ante la duda, dejá la respuesta suelta: una nube con dos
>   términos parecidos es mejor que una nube que junta dos ideas distintas.
> - Que dos respuestas compartan tema no las hace lo mismo. «arreglo» y «lista enlazada» son
>   estructuras distintas; «diafragma» y «obturador» son controles distintos.
> - Cada respuesta va en un solo grupo.
> - Las respuestas pueden traer siglas (API, SQL, GET), términos en inglés, nombres de herramientas
>   o lenguajes, y fragmentos de código. No agrupes dos siglas distintas entre sí: GET y SET, PUT y
>   POST, TCP y UDP son cosas diferentes. Sí podés agrupar una sigla con su nombre desarrollado.
> - No hace falta que todas las respuestas queden agrupadas ni que todos los grupos se conecten.
>   Devolver pocos grupos, pocas conexiones o ninguna es una respuesta válida y frecuente.
> - La lectura es para que el docente decida qué hacer en los próximos diez minutos de clase.
>   Escribila en dos o tres frases, en castellano rioplatense neutro, sin felicitaciones ni
>   consejos genéricos de pedagogía.

### Mensaje del usuario

Armado por el servidor con lo que hay en Redis:

```
Objetivos de aprendizaje de la clase:
1. Distinguir los tres controles de la profundidad de campo
2. Elegir una apertura según la intención de la foto

Pregunta proyectada: "¿Qué controla la profundidad de campo?"

Respuestas y cuántas veces apareció cada una:
diafragma — 4
la apertura del diafragma — 1
qué tan abierto está el lente — 1
diafrahma — 1
distancia al sujeto — 2
qué tan cerca está — 1
el zoom — 1
```

Resultado correcto: **diafragma** reúne las cuatro primeras (conteo 7); **distancia al sujeto**
reúne las dos siguientes (conteo 3); *el zoom* queda suelto. La pregunta apunta al objetivo 1 y no
al 2; falta la distancia focal.

Segundo ejemplo, con vocabulario de informática y sin objetivos cargados:

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

Resultado correcto: **cola** reúne a *queue* (conteo 15); **arreglo** reúne a *arreglo dinamico*
(conteo 6). *lista enlazada* y *cola de prioridad* quedan sueltas: son estructuras distintas, no
sinónimos. `lectura` es `null`.

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

**Salidas estructuradas** con esquema JSON: la respuesta viene garantizada como JSON parseable y no
hay que reintentar por texto mal formado. La primera pulsada de cada día es algo más lenta porque
el esquema se compila; después queda en caché 24 horas.

`effort: "low"` porque la tarea es acotada y en sala los segundos se notan. Si la lectura sale
pobre, subir a `medium` es cambiar una palabra.

---

## 9. Fase 1 · Validación

En el servidor, antes de devolver nada.

### Sobre los grupos

1. **Existencia.** Todo miembro tiene que existir en los conteos reales. Los que no existan se
   descartan en silencio.
2. **El nombre tiene que ser un miembro.** Si no lo es, no se descarta el grupo: **se reemplaza el
   nombre por el miembro de mayor conteo**, con desempate alfabético por `clave`. Salva un
   agrupamiento bueno con un nombre desprolijo, sin ceder en lo esencial.
3. **Mínimo dos miembros.** Un grupo que queda con uno solo tras la regla 1 se descarta.
4. **Un término, un grupo.** Si un término aparece en dos grupos, se conserva en el primero y se
   quita de los demás. Evita que el resultado dependa del orden de aplicación.
5. **Una sigla por grupo.** Si un grupo contiene dos términos cuya grafía original es toda
   mayúsculas y tiene 2 caracteres o más, el grupo se descarta entero. Bloquea `GET` con `SET`,
   `PUT` con `POST`, `TCP` con `UDP`. Una sigla junto a su nombre desarrollado (`API` con
   `interfaz de programación`) sí pasa: el segundo término no es mayúsculas.

### Sobre las conexiones

6. **Extremos válidos.** `de` y `a` tienen que ser nombres de grupos devueltos y validados. Lo
   demás se descarta.
7. **Sin bucles ni duplicados.** Nada de `de === a`, y una sola arista por par sin importar el
   orden.
8. **Máximo 8.** Un mapa proyectado con más aristas deja de leerse. Se conservan las primeras 8.

### Sobre la lectura

9. **`objetivosTocados` tiene que ser texto literal de las líneas que escribió el docente.** Lo que
   no coincida se descarta; si no queda ninguno, `lectura` pasa a `null`.
10. **`texto` se recorta a 400 caracteres.** Es lo que entra legible en un proyector.
11. **Sin objetivos cargados, `lectura` es `null`** aunque el modelo devuelva algo.

`aparecieron` y `faltaron` son texto libre a propósito: son conceptos *dentro* de un objetivo, y el
docente rara vez los escribe uno por línea. Es la única parte de la salida que no se ancla a algo
que ya existía, y por eso vive solo en el panel de lectura y nunca toca la nube.

**Lo que estas reglas no cubren.** Nada impide que el modelo junte dos frases que a él le parecen
lo mismo y al docente no, ni que la lectura sea superficial. La validación garantiza que lo
proyectado sea real y que las siglas queden intactas; **no puede garantizar que el criterio sea
bueno.** Por eso existe el deshacer y por eso nada se escribe en Redis.

---

## 10. Fase 1 · En pantalla

Con la votación cerrada, junto al panel de las 5 más repetidas aparece un botón **Analizar**.

Al pulsarlo pasa a *"Analizando…"* y queda inhabilitado. Dos a cuatro segundos después:

1. **La nube se reordena.** Cada grupo aparece como un solo término, del tamaño que le corresponde
   por la suma de sus miembros. Los miembros desaparecen con el mismo latido que ya usa la nube al
   subir un conteo. **No hay animación nueva.**
2. **El panel de conteos se enriquece.** Cada término del top 5 que sea un grupo gana una línea
   debajo: `diafragma 7 — reúne: diafrahma, la apertura del diafragma`.
3. **Aparecen dos botones:** *Ver respuestas tal cual* (vuelve a la nube cruda; otro clic reaplica
   el análisis sin volver a llamar a la API) y *Lectura de la clase* (solo si hubo objetivos).
4. **La lectura se abre en un panel** sobre el lienzo, con las tres partes: a qué objetivo apuntaba
   la pregunta, qué apareció, qué faltó, y las dos o tres frases. Se cierra con un clic o con Esc,
   igual que el QR ampliado. **Nunca se abre sola.**

Si el modelo no encuentra grupos, el botón dice *"nada que agrupar"* unos segundos y vuelve a su
estado normal — y la lectura igual queda disponible si había objetivos. Si algo falla, aparece una
línea gris *"No se pudo analizar. Volvé a pulsar."* y la nube queda exactamente como estaba: **o se
aplica el análisis completo o no se aplica nada.**

### El deshacer no es un detalle

Agrupar es juicio, no cálculo: dos corridas sobre las mismas respuestas pueden dar resultados
distintos, y a veces va a agrupar mal. El deshacer vuelve aceptable ese riesgo — el costo de una
agrupación mala pasa a ser un clic, no recargar la página delante del curso. Volver a pulsar
**Analizar** reagrupa desde cero, que en la práctica funciona como un segundo intento.

Cuesta diez líneas: el resultado vive en memoria, deshacer es ponerlo en `null` y repintar.

### Que la lectura no aparezca sola es deliberado

La lectura dice cosas como *"no apareció la distancia focal"*. Eso habla del grupo, no de un alumno
—y por eso es mucho más seguro que juzgar respuestas— pero sigue siendo texto generado proyectado
en una sala. El docente lo abre cuando quiere, lo lee, y decide si el curso lo ve o si lo comenta
con sus palabras.

---

## 11. Fase 2 · El mapa de conexiones

Un tercer estado de la vista, junto a *nube* y *nube agrupada*: el botón **Ver mapa**.

### Disposición determinista, no simulación de fuerzas

Un grafo *force-directed* se sacude hasta acomodarse y llega a una disposición distinta cada vez.
Este proyecto tiene una regla dura —lo que está en pantalla no se mueve— y un proyector es el peor
lugar para esperar a que un grafo asiente.

**Los grupos se ubican en un anillo**, ordenados por conteo y alternando lados para que los nodos
grandes no se apelotonen. El radio de cada nodo va con la raíz cuadrada del conteo, como el tamaño
en la nube. Las conexiones son arcos de Bézier entre nodos. Misma entrada, misma imagen, sin
temblor y sin espera. Son unas 80 líneas de SVG en un módulo nuevo, `js/mapa.js`, puro y testeable
igual que `nube.js`.

### Un nodo por grupo, no por respuesta

Sesenta respuestas sueltas en un grafo proyectado son una madeja ilegible. Seis grupos se leen
desde la última fila. Bajo el nombre de cada nodo van hasta dos miembros en texto chico, y `+N` si
hay más. Las respuestas que no entraron en ningún grupo **no aparecen en el mapa**: siguen en la
nube, que es la vista donde viven.

### Colores

Los nodos usan la misma rampa de `tono.js` que la nube, por conteo. **No hay color por grupo**: si
el color pasa a significar «grupo», se pierde la señal de que tono y tamaño significan frecuencia,
que es lo único que la pantalla comunica bien desde la última fila. Los arcos van en el gris del
texto secundario, sin acento propio.

---

## 12. Arquitectura y archivos

| Archivo | Fase | Responsabilidad |
|---|---|---|
| `api/_lib/ia.js` | 1 | Arma el prompt, llama a Anthropic con `fetch`, valida la respuesta. Exporta `armarPrompt` y `validarAnalisis` aparte de la llamada, para probarlos sin red. |
| `js/plan.js` | 1 | Puro: `aplicarGrupos(palabras, grupos)`. Sin DOM, sin red. |
| `js/mapa.js` | 2 | Puro hasta el último paso: `disponerMapa(grupos, conexiones, ancho, alto)` devuelve coordenadas; el pintado en SVG va aparte. |

Modificados: `api/_lib/rutas.js` (dos acciones y dos ramas de enrutamiento), `index.html` (diálogo
de objetivos, panel de lectura, botones, contenedor del mapa), `js/profesor.js` (estado y
aplicación al pintar), `css/estilo.css`.

El proyecto sigue con **cero dependencias, cero `node_modules`, cero paso de build**. Se usa `fetch`
igual que `store-redis.js` con Upstash.

### Aplicación en el cliente

`aplicarGrupos(palabras, grupos)` recibe lo que ya devuelve `GET …/nube` —`[{ clave, texto,
conteo }]`— y:

- suma los conteos de todos los miembros de cada grupo,
- usa el `nombre` del grupo como `texto` y su `clave` como clave,
- elimina de la lista a los demás miembros,
- deja intacto lo que no pertenece a ningún grupo,
- reordena por conteo, con el mismo desempate alfabético por `clave` que usa `verNube`, para que el
  resultado sea estable entre repintados.

**El análisis vive en `profesor.js` como estado en memoria y se reaplica en cada pintado.** Si
llegan respuestas nuevas, se les sigue aplicando sin volver a llamar a la API; una respuesta nueva
que no esté en ningún grupo aparece suelta. Si se recarga la página, vuelve la nube cruda: **Redis
nunca se toca, y lo que respondieron los alumnos queda intacto.**

---

## 13. Errores y casos borde

| Caso | Comportamiento |
|---|---|
| Sin `ANTHROPIC_API_KEY` en el entorno | 502, mensaje en pantalla, nube intacta |
| Anthropic devuelve 429 o 5xx | 502, *"No se pudo analizar. Volvé a pulsar."* Sin reintento automático |
| Respuesta que no valida contra el esquema | 502. No se aplica nada parcial |
| Grupos válidos pero lista vacía | 200, *"nada que agrupar"*; la lectura sigue disponible |
| Sin objetivos cargados | 200 con `lectura: null`; el botón de lectura no aparece |
| Objetivos cargados después de analizar | El análisis previo no cambia; hay que volver a pulsar |
| Sala o pregunta expirada a mitad de camino | 404, mensaje normal de sala inexistente |
| Se pulsa Analizar dos veces | El botón queda inhabilitado mientras corre |
| Llega una respuesta nueva tras analizar | Aparece suelta; los grupos existentes se mantienen |
| Se analiza, luego se lanza otra pregunta | El análisis se descarta: es por pregunta, no por sala |
| Modo nocturno | Panel de lectura y mapa usan la rampa de `tono.js`, sin color propio |
| Un solo grupo, sin conexiones | El botón del mapa no aparece: un nodo suelto no es un mapa |

**No hay reintento automático a propósito.** El SDK lo daría gratis, pero se descartó el SDK para
conservar cero dependencias. El botón se vuelve a pulsar, que en una sala es más rápido y más
predecible que una espera silenciosa que se alarga.

---

## 14. Pruebas

**Puras, con `node --test`:**

- `aplicarGrupos` suma conteos, usa el nombre del grupo como texto y deja intacto lo no agrupado.
- `aplicarGrupos` con lista vacía devuelve las palabras idénticas.
- El orden resultante es estable ante empates.
- La validación descarta miembros que no están en los conteos.
- La validación reemplaza un nombre que no es miembro por el miembro de mayor conteo.
- La validación descarta un grupo que queda con un solo miembro.
- La validación quita un término repetido del segundo grupo, no del primero.
- La validación descarta un grupo con dos siglas (`GET`+`SET`, `TCP`+`UDP`).
- La validación acepta `API` + `interfaz de programación`.
- La validación descarta conexiones a grupos inexistentes, bucles y duplicados invertidos.
- La validación descarta `objetivosTocados` que no son texto literal del docente.
- Sin objetivos, `lectura` sale `null` aunque el modelo devuelva algo.
- `rutas.test.js`: 403 sin token de profesor en `objetivos` y en `analizar`; 404 con sala
  inexistente; tope por sala.
- **Fase 2:** `disponerMapa` es determinista —dos llamadas con la misma entrada dan las mismas
  coordenadas— y ningún nodo se sale del lienzo.

**Ciclo de `/pruebas`:** una llamada real a la API, también cuando se apunta a producción. Cuesta
poco más de un centavo por corrida y es deliberado — apuntar `/pruebas` a producción es lo que
encontró 3 de los 4 bugs que solo aparecían desplegado, y el camino que solo falla desplegado
(clave ausente, variable de entorno mal nombrada, CORS) no se cubre de otra forma.

---

## 15. Qué queda fuera a propósito

- **Cambiar cualquier cosa del lado del alumno.** Restricción explícita del encargo.
- **Persistir objetivos, grupos o lecturas entre clases.** Restricción explícita del encargo. Todo
  muere con el TTL de 6 horas.
- **Juzgar respuestas de alumnos como correctas o incorrectas.** La lectura habla del curso y de
  los objetivos, nunca de una respuesta.
- **Editar un grupo a mano.** Deshacer y volver a pulsar cubre el caso con diez líneas en vez de
  una interfaz de edición sobre el proyector.
- **Que el alumno vea grupos, mapa o lectura en su teléfono.** Obligaría a que 30 teléfonos
  consulten de fondo, decisión ya rechazada en la spec original.
- **Simulación de fuerzas en el mapa.** Se sacude, no es reproducible, y choca con la regla de que
  lo proyectado no se mueve.
- **Streaming de la respuesta.** Tres segundos no lo necesitan, y agregaría manejo de SSE.

**Regla de gobierno vigente:** si aparece una necesidad docente nueva que no sea una nube de
palabras, se construye como otra herramienta pequeña en `utilidades/`, nunca como una función más
de esta.

---

## 16. Costo

Cada pulsada manda ~900 tokens de entrada (instrucción, objetivos, pregunta y respuestas) y recibe
~700 de salida. Con `claude-sonnet-5` a US$3 y US$15 por millón:

| | |
|---|---|
| Por pulsada | ~US$0,013 |
| Tope por sala (30 análisis) | US$0,39 |
| Semestre (5 preguntas × 4 clases × 15 semanas) | ~US$3,90 |
| Corrida completa de `/pruebas` | US$0,013 |

El costo no es una restricción de diseño. La latencia sí: por eso Sonnet y no Opus, y `effort` en
`low`.

---

## 17. Umbrales que este cambio cruza

Cuatro cosas que hasta hoy el proyecto no tenía.

1. **Un secreto.** `ANTHROPIC_API_KEY` como variable de entorno en Vercel. Se usa solo dentro de la
   función serverless; nunca llega al navegador.
2. **Un costo por uso.** Acotado arriba y con tope por sala.
3. **Una salida de datos a un tercero.** Las respuestas de los alumnos y los objetivos de la clase
   viajan a la API de Anthropic. Las respuestas son palabras y frases cortas, anónimas, sin nombre
   ni identificador. **Si Duoc UC tiene política sobre enviar producción de estudiantes a un
   servicio de IA, esa política manda sobre esta spec.** Pendiente de confirmar con Juan.
4. **Segundos de espera en vivo.** El primer punto del sistema donde el proyector espera delante
   del curso. Mitigado con `effort` bajo y con estado visible en el botón.

---

## 18. Lo que sigue sin saberse

La agrupación se diseñó sobre una suposición razonada, no sobre un dato: que las respuestas en
frases degradan la nube lo suficiente como para justificarla. **El número que lo confirmaría es
cuántas respuestas distintas produjo el curso frente a cuántos alumnos**, y sigue sin anotarse — el
campo de datos de la entrada del 2026-08-08 en la bitácora quedó vacío.

Si 30 alumnos producen 12 términos distintos con conteos repartidos, agrupar aporta poco. Si
producen 60 con conteo 1, es lo más valioso del backlog. **La lectura contra objetivos no depende
de ese número**: sirve igual en los dos escenarios, y es la razón por la que va en la Fase 1.

Anotar una clase antes de implementar vale más que cualquier ajuste a esta spec.
