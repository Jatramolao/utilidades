# Análisis semántico — diseño

**Fecha:** 2026-08-14 · **Estado:** Fase 1 aprobada por Juan, sin implementar

Tercera spec del proyecto. Las dos anteriores son
[`2026-08-07-nube-palabras-design.md`](2026-08-07-nube-palabras-design.md) (el sistema) y
[`2026-08-08-pantalla-proyectada-design.md`](2026-08-08-pantalla-proyectada-design.md) (v1.1).

Es una **capa adicional sobre la nube que ya está en producción**, no un reemplazo. El §14 guarda
el diseño de las fases posteriores; todo lo demás describe la Fase 1, que es lo que se construye
ahora.

---

## 1. Qué se construye

Un botón **Lectura** en la pantalla proyectada, con la votación cerrada. Manda la pregunta y las
respuestas a un modelo de lenguaje y abre un panel con **dos o tres frases sobre qué está diciendo
el curso**. Se cierra con un clic o con Esc.

Nada más. **La nube no se toca**: no se agrupa, no se fusiona, no se reordena.

## 2. Por qué esto primero

Una versión anterior de esta spec diseñaba la agrupación semántica aplicada a la nube. Se pospuso
por una razón concreta: **casi toda su complejidad venía de modificar la nube**. De ahí salían las
cinco reglas de validación de grupos, la de siglas, el deshacer, la reaplicación en cada repintado
y el orden estable — más un módulo entero, `js/plan.js`.

Si el análisis no modifica la nube, todo eso no se simplifica: **deja de existir**. Queda un
archivo nuevo, una ruta y una regla de validación.

Hay además una razón de fondo. La agrupación vale mucho o poco según un dato que todavía no está
anotado —cuántas respuestas distintas produce un curso frente a cuántos alumnos, ver §15—. **La
lectura sirve igual en los dos escenarios.**

## 3. El riesgo del que hay que defenderse

Un panel que dice *"la respuesta más votada fue «diafragma» con 7"* no aporta nada: eso el docente
lo tiene en pantalla, en letras grandes, desde antes de pulsar el botón. **Si la lectura describe
lo que la nube ya muestra, la función no vale la latencia ni el costo.**

Todo el §6 está escrito contra ese riesgo. La instrucción le prohíbe al modelo listar respuestas y
decir cuál ganó, y le pide en cambio las cuatro cosas que una nube es incapaz de mostrar:

| La nube muestra | La nube no puede mostrar |
|---|---|
| Qué se dijo y cuántas veces | Si respuestas escritas distinto **convergen** en una misma idea |
| Cuál fue la más repetida | Si el curso está **dividido** en dos o más lecturas |
| El tamaño relativo de cada término | Una idea que varias respuestas **rodean sin nombrar** |
| | Si una **minoría** dice algo que vale la pena mirar |

## 4. Qué no cambia

Restricciones explícitas del encargo, anotadas para que ninguna decisión posterior las erosione:

- **La interfaz y el flujo del alumno no se tocan.** Mismo QR, mismo formulario, mismas hasta tres
  respuestas de hasta 30 caracteres. Nada de esta spec llega al teléfono de un alumno.
- **No se construye una herramienta nueva.** Es una capa sobre la nube existente.
- **No hay persistencia entre clases.** La Fase 1 **no escribe nada en Redis**: lee la pregunta y
  los conteos que ya están, y devuelve texto. No aparece ninguna clave, campo ni estructura nueva.
- **La nube sigue siendo la vista principal**, y en la Fase 1 la única.

---

## 5. Decisiones tomadas

Con Juan, el 2026-08-14, antes de escribir una línea.

| Decisión | Elegida | Descartada |
|---|---|---|
| Primer corte | Solo la lectura; la nube intacta | Agrupación aplicada a la nube; el mapa |
| Objetivos de aprendizaje | No, en esta fase | Diálogo de objetivos + comparación contra ellos |
| Qué ve el modelo | Todas las respuestas con sus conteos | Solo las cinco o diez más repetidas |
| Dónde centra la lectura | En lo más repetido; la minoría solo si aporta | Peso igual a todo |
| Cuándo aparece el panel | Se abre con un botón y lo cierra el docente | Aparece solo al cerrar la votación |
| Modelo | `claude-sonnet-5` | Haiku 4.5, Opus 5 |
| Cómo se llama a la API | `fetch` directo | SDK oficial de Anthropic |

**Sobre mandar todas las respuestas y no el top 5.** Son unas 90 cadenas de hasta 30 caracteres:
cuesta prácticamente lo mismo. Y la observación más valiosa suele ser *"la mayoría dijo X, pero
cinco apuntaron a otra cosa"* — que se pierde entera si el modelo solo ve las más votadas. Lo que
se acota es dónde **centra** la lectura, no qué ve.

**Sobre que el panel no aparezca solo.** Es texto generado proyectado en una sala. El docente lo
abre cuando quiere, lo lee, y decide si el curso lo ve o si lo comenta con sus palabras.

---

## 6. El prompt

Vive como una constante al inicio de `api/_lib/ia.js`, en un solo lugar, para que ajustarlo no sea
tocar lógica.

### Instrucción de sistema

> Sos el asistente de una herramienta de aula. Un docente proyectó una pregunta y sus alumnos
> respondieron de forma anónima, con palabras sueltas o frases cortas. El docente ya está viendo
> una nube de palabras donde el tamaño de cada respuesta indica cuántas veces apareció.
>
> Tu tarea es escribir, en dos o tres frases, **qué está diciendo el curso**.
>
> No enumeres las respuestas ni digas cuál fue la más votada: eso el docente lo tiene en pantalla,
> en letras grandes, desde antes de leerte. Escribí lo que la nube no puede mostrar:
>
> - Si respuestas escritas de forma distinta convergen en una misma idea, y cuál es esa idea.
> - Si el curso está dividido en dos o más lecturas distintas, y cuáles son.
> - Si hay una idea que varias respuestas rodean sin llegar a nombrar.
> - Si una minoría dice algo que vale la pena mirar.
>
> Seis reglas:
> - Nunca digas si una respuesta es correcta o incorrecta. Describís lo que el curso piensa, no lo
>   evaluás. Esto se proyecta delante del curso.
> - Cuando menciones una respuesta, citala tal como la escribieron los alumnos.
> - Centrá la lectura en lo más repetido. Mencioná una respuesta poco frecuente solo si aporta algo
>   que las demás no dicen.
> - **Si las respuestas no tienen un patrón claro, decilo en una frase y terminá ahí.** Es una
>   lectura válida y es mejor que inventar una coherencia que no está.
> - Las respuestas pueden traer siglas, términos técnicos en inglés, nombres de herramientas o
>   lenguajes, y fragmentos de código. No los traduzcas ni los corrijas.
> - Dos o tres frases, en castellano neutro. Sin encabezados, sin viñetas, sin consejos de
>   pedagogía, sin felicitar al curso.

### Mensaje del usuario

Armado por el servidor con lo que hay en Redis:

```
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

Una lectura correcta: *"Casi todo el curso está describiendo lo mismo con palabras distintas — el
diafragma, la apertura, «qué tan abierto está el lente» son la misma idea. Aparece también la
distancia al sujeto, en tres respuestas. Nadie nombró la distancia focal, aunque «el zoom» la
está rozando."*

Lo que **no** sería una lectura correcta: *"La respuesta más frecuente fue «diafragma» con 4
menciones, seguida de «distancia al sujeto» con 2."* Eso es la nube dicha en prosa.

### La regla que más pesa

*"Si las respuestas no tienen un patrón claro, decilo y terminá ahí."* A un modelo al que le pedís
interpretar, interpreta: le encuentra sentido al ruido para no parecer inútil. Esa línea hace que
el silencio sea una salida legítima, y es la misma función que cumplía *"podés devolver listas
vacías"* en el diseño de agrupación.

### Parámetros de la llamada

```
POST https://api.anthropic.com/v1/messages
x-api-key: $ANTHROPIC_API_KEY
anthropic-version: 2023-06-01

model: "claude-sonnet-5"
max_tokens: 1024
thinking: { "type": "adaptive" }
output_config: { "effort": "low", "format": { "type": "json_schema", "schema": … } }
```

Esquema: `{ "lectura": "string" }`, con `additionalProperties: false`. **Salidas estructuradas**
para que la respuesta venga garantizada como JSON parseable y no haya que reintentar por texto mal
formado. La primera pulsada de cada día es algo más lenta porque el esquema se compila; después
queda en caché 24 horas.

`effort: "low"` porque la tarea es acotada y en sala los segundos se notan. Si la lectura sale
pobre, subir a `medium` es cambiar una palabra.

**Latencia medida en producción: ~5,4 segundos**, igual en frío que en caliente. Es más de los 2-4
que estimé al diseñar. El lever que queda sin usar es `thinking: {type: "disabled"}`, que Sonnet 5
acepta con `effort` bajo y recortaría bastante — a costa de calidad en un juicio que es todo el
valor de la función. Queda sin tocar hasta que Juan la use en clase y diga si cinco segundos
molestan.

---

## 7. Contrato de la ruta

```
POST /api/sala/:codigo/pregunta/:n/lectura
Cabecera: x-token-profesor
Cuerpo: (vacío)
```

**El cliente no manda datos.** El servidor lee la pregunta y los conteos de Redis con la misma
lógica que ya usa `verNube`. Así nadie puede mandar cuatro mil respuestas inventadas para quemar
presupuesto, y la lectura siempre se calcula sobre el estado real.

**Autorización: `exigirProfesor`**, la misma que protege cerrar la votación y borrar palabras. Solo
quien creó la sala puede gastar. El límite por IP existente (`MAX_ENVIOS_POR_IP`) queda como
segundo cinturón, más un tope de 30 lecturas por sala en las 6 horas de TTL, con el mismo
`incrConTtl` que ya usa el sistema.

**Respuesta 200:** `{ "lectura": "Casi todo el curso está describiendo lo mismo…" }`

**Errores:** 403 sin token de profesor, 404 sala o pregunta inexistente, 409 si la pregunta no
tiene ninguna respuesta todavía, 429 tope alcanzado, 502 si Anthropic falla o devuelve algo
inválido.

## 8. Validación

Una sola regla: **`lectura` se recorta a 600 caracteres**, cortando en un límite de palabra. Acota
el daño si el modelo se extiende pese a la instrucción.

> **Medido contra la API real el 2026-08-14:** con un tope de 400 se truncaron **tres lecturas de
> tres**, y el corte se comía siempre la última frase — que es justo la observación que el prompt
> pide (la minoría que aporta algo). Tres frases sustantivas en castellano pasan los 400 con
> facilidad. 600 las deja entrar enteras y sigue siendo legible proyectado.

No hace falta más. La lectura es prosa que vive en su propio panel: **no reescribe respuestas de
alumnos, no se mezcla con la nube y no altera ningún conteo.** Toda la maquinaria de validación de
las versiones anteriores de esta spec existía para proteger la nube, y en la Fase 1 la nube no se
toca.

Lo que sigue en pie es que la lectura puede ser superficial, o encontrar un patrón que no está.
Contra eso no hay validación posible: hay una instrucción explícita en el prompt (§6) y el hecho de
que el docente decide si el curso la ve.

---

## 9. En pantalla

Con la votación cerrada aparece un botón **Lectura** junto al de conteos, en la barra superior.

Al pulsarlo pasa a *"Leyendo…"* y queda inhabilitado. Unos cinco segundos después se abre un panel
sobre el lienzo con el texto, y el botón vuelve a su estado normal. **El panel se cierra con un
clic fuera o con Esc**, igual que el QR ampliado — el mismo patrón que ya existe, no uno nuevo.

Volver a pulsar **Lectura** vuelve a llamar a la API y produce una lectura nueva, que puede ser
distinta: esto es juicio, no cálculo.

Si algo falla, aparece una línea gris *"No se pudo leer. Volvé a pulsar."* y no se abre nada.

**El panel usa la rampa de `tono.js` y respeta el modo nocturno**, sin color propio. No se
superpone al QR de la esquina ni a los conteos: se abre sobre el lienzo con el mismo tratamiento
que la vista ampliada del QR, que ya resolvió esa pelea por el espacio.

---

## 10. Arquitectura

**Un archivo nuevo.**

| Archivo | Responsabilidad |
|---|---|
| `api/_lib/ia.js` | Arma el prompt, llama a Anthropic con `fetch`, recorta la respuesta. Exporta `armarPrompt` aparte de la llamada, para probarlo sin red. |

Modificados: `api/_lib/rutas.js` (una acción y una rama de enrutamiento), `index.html` (un botón y
un panel), `js/profesor.js` (estado del botón, abrir y cerrar el panel), `css/estilo.css`.

El proyecto sigue con **cero dependencias, cero `node_modules`, cero paso de build**. Se usa
`fetch` igual que `store-redis.js` con Upstash.

## 11. Errores y casos borde

| Caso | Comportamiento |
|---|---|
| Sin `ANTHROPIC_API_KEY` en el entorno | 502, línea gris en pantalla, no se abre el panel |
| Anthropic devuelve 429 o 5xx | 502, *"No se pudo leer. Volvé a pulsar."* Sin reintento automático |
| Respuesta que no valida contra el esquema | 502 |
| La pregunta no tiene respuestas todavía | 409; el botón ni siquiera aparece antes de cerrar la votación |
| Una sola respuesta | Corre igual; la lectura dirá que no hay patrón |
| Sala o pregunta expirada a mitad de camino | 404, mensaje normal de sala inexistente |
| Se pulsa Lectura dos veces seguidas | El botón queda inhabilitado mientras corre |
| Llegan respuestas nuevas tras leer | La lectura previa no se actualiza sola; hay que volver a pulsar |
| Se lanza otra pregunta | La lectura se descarta: es por pregunta, no por sala |
| Modo nocturno | El panel usa la rampa de `tono.js` |

**No hay reintento automático a propósito.** El SDK lo daría gratis, pero se descartó el SDK para
conservar cero dependencias. El botón se vuelve a pulsar, que en una sala es más rápido y más
predecible que una espera silenciosa que se alarga.

## 12. Pruebas

**Puras, con `node --test`:**

- `armarPrompt` incluye la pregunta y todas las respuestas con sus conteos.
- `armarPrompt` ordena las respuestas por conteo descendente, con desempate alfabético, para que
  el prompt sea estable entre llamadas y la caché sirva.
- El recorte a 400 caracteres corta en un límite de palabra, no a mitad de una.
- `rutas.test.js`: 403 sin token de profesor; 404 con sala inexistente; 409 sin respuestas; el tope
  por sala.

**Ciclo de `/pruebas`:** una llamada real a la API, también cuando se apunta a producción. Cuesta
menos de medio centavo por corrida y es deliberado — apuntar `/pruebas` a producción es lo que
encontró 3 de los 4 bugs que solo aparecían desplegado, y el camino que solo falla desplegado
(clave ausente, variable de entorno mal nombrada, CORS) no se cubre de otra forma.

## 13. Costo

Cada pulsada manda ~600 tokens de entrada y recibe ~150 de salida. Con `claude-sonnet-5` a US$3 y
US$15 por millón:

| | |
|---|---|
| Por pulsada | ~US$0,004 |
| Tope por sala (30 lecturas) | US$0,12 |
| Semestre (5 preguntas × 4 clases × 15 semanas) | ~US$1,20 |
| Corrida completa de `/pruebas` | US$0,004 |

El costo no es una restricción de diseño. La latencia sí: por eso Sonnet y no Opus, y `effort` en
`low`.

### Umbrales que este cambio cruza

Tres cosas que hasta hoy el proyecto no tenía.

1. **Un secreto.** `ANTHROPIC_API_KEY` como variable de entorno en Vercel. Se usa solo dentro de la
   función serverless; nunca llega al navegador.
2. **Una salida de datos a un tercero.** Las respuestas de los alumnos viajan a la API de
   Anthropic. Son palabras y frases cortas, anónimas, sin nombre ni identificador. **Si Duoc UC
   tiene política sobre enviar producción de estudiantes a un servicio de IA, esa política manda
   sobre esta spec.** Pendiente de confirmar con Juan.
3. **Segundos de espera en vivo.** El primer punto del sistema donde el proyector espera delante
   del curso. Mitigado con `effort` bajo y con estado visible en el botón.

---

## 14. Fases posteriores

Diseñadas antes de recortar el alcance. **No se construyen ahora.** Se conservan porque el trabajo
de diseño ya está hecho y porque la Fase 1 no cierra ninguna de estas puertas: la ruta, el prompt
y el esquema pueden crecer sin romperse.

### Fase 2 · Agrupación semántica aplicada a la nube

El modelo devuelve además `grupos`: conjuntos de respuestas que dicen lo mismo, cada uno con un
`nombre` **que tiene que ser una de las respuestas del grupo**, para que en la nube nunca aparezca
una palabra que ningún alumno escribió. La nube pasa a mostrar un término por grupo con la suma de
los conteos, y un botón vuelve a la nube cruda.

Requiere: `js/plan.js` con `aplicarGrupos(palabras, grupos)` puro, reaplicación en cada repintado,
un botón de deshacer, y cinco reglas de validación —existencia de cada miembro; nombre que sea
miembro (si no, se reemplaza por el de mayor conteo); mínimo dos miembros; un término en un solo
grupo; **y una sigla por grupo**, que es lo que impide fundir `GET` con `SET`, `PUT` con `POST` o
`TCP` con `UDP` en una pregunta de informática.

**Depende del dato del §15.** Si el curso produce doce términos con conteos repartidos, aporta
poco; si produce sesenta con conteo 1, es lo más valioso del backlog.

### Fase 3 · Objetivos de aprendizaje

Un diálogo donde el docente escribe los objetivos de la clase, un objetivo por línea, guardados en
el campo `objetivos` del hash `sala:{codigo}` que ya existe — mismo TTL de 6 horas, ninguna clave
nueva. La lectura pasa a comparar lo respondido contra ellos: qué conceptos aparecieron, cuáles no
pese a ser relevantes, y qué tan alineado está el curso.

**El modelo infiere a qué objetivo apunta cada pregunta.** Sin eso, las cinco preguntas de una
clase dirían *"faltaron los objetivos 2, 3 y 4"*, porque esa pregunta no era sobre ellos, y la
sección más valiosa se volvería ruido en la primera clase. La alternativa —que el docente etiquete
cada pregunta al lanzarla— devuelve la fricción que el sistema entero existe para evitar.

### Fase 4 · El mapa de conexiones

Una segunda vista: los grupos como nodos, las relaciones entre ellos como arcos.

**Disposición determinista en anillo, no simulación de fuerzas.** Un grafo *force-directed* se
sacude hasta acomodarse y da una imagen distinta cada vez; este proyecto tiene la regla de que lo
proyectado no se mueve, y un proyector es el peor lugar para esperar a que un grafo asiente. Los
nodos van en un anillo ordenados por conteo, con radio proporcional a la raíz cuadrada del conteo y
arcos de Bézier entre ellos. Módulo nuevo `js/mapa.js`, puro y testeable como `nube.js`.

**Un nodo por grupo, no por respuesta:** sesenta respuestas sueltas en un grafo proyectado son una
madeja ilegible; seis grupos se leen desde la última fila.

**Sin color por grupo.** Los nodos usan la rampa de `tono.js` por conteo, igual que la nube. Si el
color pasa a significar «grupo», se pierde la señal de que tono y tamaño significan frecuencia, que
es lo único que la pantalla comunica bien desde la última fila.

---

## 15. Lo que sigue sin saberse

**Cuántas respuestas distintas produce un curso frente a cuántos alumnos.** El campo de datos de la
entrada del 2026-08-08 en [`BITACORA.md`](../../../BITACORA.md) quedó vacío.

Ese número decide si la Fase 2 vale la pena: con doce términos y conteos repartidos, agrupar aporta
poco; con sesenta respuestas de conteo 1, la nube deja de comunicar y agrupar es lo más valioso del
backlog.

**La Fase 1 no depende de ese número** —la lectura sirve igual en los dos escenarios—, y es otra
razón para que vaya primero. Pero anotarlo en la bitácora sigue valiendo más que cualquier ajuste a
esta spec.
