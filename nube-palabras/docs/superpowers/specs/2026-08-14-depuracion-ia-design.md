# Depuración con IA — diseño

**Fecha:** 2026-08-14 · **Estado:** aprobado por Juan, sin implementar

Tercera spec del proyecto. Las dos anteriores son
[`2026-08-07-nube-palabras-design.md`](2026-08-07-nube-palabras-design.md) (el sistema) y
[`2026-08-08-pantalla-proyectada-design.md`](2026-08-08-pantalla-proyectada-design.md) (v1.1).

---

## 1. Qué se construye

Un botón en la pantalla proyectada que, con la votación ya cerrada, manda la pregunta y las
respuestas a un modelo de lenguaje y recibe dos cosas:

- **Correcciones de escritura.** «diafrahma» y «diafragma» son la misma palabra; se funden en la
  nube y el conteo se suma.
- **Cercanías.** Para los términos más repetidos, qué otras respuestas de la lista dicen lo mismo
  con otras palabras.

Nada más. En particular **no** juzga si una respuesta es correcta.

### Por qué esto y no otra cosa

`normalizar.js` se niega a fusionar singular y plural porque destrozaría «análisis», «crisis»,
«síntesis» y «lunes» — y sin contexto es la decisión correcta. Un modelo que ve la pregunta sí
puede distinguir «lente» de «lentes» en una pregunta de óptica. Esta es la única función del
sistema que necesita entender el contenido, y por eso es la única que justifica un modelo.

Resuelve además, de paso, dos ítems que estaban en el backlog sin fecha: `M-01` (fusionar dos
términos a mano) y parte de `M-04` (palabras vacías).

---

## 2. Decisiones tomadas

Todas con Juan, el 2026-08-14, antes de escribir una línea.

| Decisión | Elegida | Descartada |
|---|---|---|
| Qué hace el insight | Corregir escritura y agrupar por cercanía, con la pregunta como contexto | Declarar de antemano los conceptos esperados y reportar los que faltan |
| Qué corrige | Solo la escritura | Marcar respuestas conceptualmente erróneas |
| Cuándo corre | Botón en clase, con la votación cerrada; aplica a la nube | Solo un panel; después de clase |
| Modelo | `claude-haiku-4-5` | Sonnet 5, Opus 5 |
| Cómo se llama a la API | `fetch` directo | SDK oficial de Anthropic |
| Dónde vive la fusión | En memoria, en la pantalla del profesor | Escrita en Redis |

**La de conceptos esperados es la más importante de las descartadas.** Habría dado el análisis
más rico —decirle al profesor qué concepto nadie mencionó— pero exige que Juan escriba tres o
cuatro términos cada vez que lanza una pregunta. La herramienta existe porque lanzar una pregunta
cuesta diez segundos; agregarle quince la volvería otra cosa.

**La de no juzgar conceptos** cierra un riesgo concreto: la nube se proyecta delante del curso.
Una IA que marca una respuesta como equivocada señala a alguien que, aunque sea anónimo, se
reconoce — y a veces se equivoca ella.

---

## 3. Experiencia en sala

Con la votación cerrada, junto al panel de las 5 más repetidas aparece un botón **Depurar**.

Al pulsarlo el botón pasa a *"Depurando…"* y queda inhabilitado. Uno o dos segundos después:

1. **La nube se limpia.** Las variantes se funden con el mismo latido que ya usa la nube al subir
   un conteo. No hay animación nueva.
2. **El panel de conteos se enriquece.** Cada término del top 5 gana una línea debajo:
   `diafragma 12 — cerca: apertura, entrada de luz`.

Si el plan viene vacío, el botón dice *"nada que depurar"* durante unos segundos y vuelve a su
estado normal. No es un error.

Si algo falla, aparece una línea gris — *"No se pudo depurar. Volvé a pulsar."* — y la nube queda
exactamente como estaba. **O se aplica el plan completo o no se aplica nada.**

### Lo que no se hace, y por qué

- **No se colorea la nube por grupo.** `tono.js` mapea luminosidad a conteo, calibrado a ≥4,5:1 de
  contraste y verificado en pruebas. Si el color pasa a significar «grupo», el lector de la última
  fila pierde la única señal que la nube transmite bien: tamaño y tono significan frecuencia.
- **No hay un panel de grupos aparte.** Sería una tercera tarjeta peleando por la franja inferior
  con el QR y los conteos, que es donde aparecieron tres bugs de solapamiento en producción.
- **La fusión nunca la dispara el sondeo de 2 segundos.** La regla dura de la pantalla proyectada
  —una palabra ya en pantalla no se mueve, solo escala— se mantiene porque la depuración es un
  evento único y deliberado del profesor.

---

## 4. Arquitectura

Dos archivos nuevos, ambos pequeños, y ninguna dependencia npm.

| Archivo | Responsabilidad |
|---|---|
| `api/_lib/ia.js` | Arma el prompt, llama a Anthropic con `fetch`, valida el plan devuelto. Exporta `armarPrompt` y `validarPlan` por separado de la llamada, para poder probarlos sin red. |
| `js/plan.js` | Función pura `aplicarPlan(palabras, plan)`. Sin DOM, sin red. |

Modificados: `api/_lib/rutas.js` (una acción y una rama de enrutamiento),
`js/profesor.js` (botón, estado, aplicación al pintar), `css/estilo.css` (el botón y la línea de
cercanías).

El proyecto sigue con cero dependencias, cero `node_modules`, cero paso de build. Se usa `fetch`
igual que `store-redis.js` con Upstash.

---

## 5. Contrato de la ruta

```
POST /api/sala/:codigo/pregunta/:n/depurar
Cabecera: x-token-profesor
Cuerpo: (vacío)
```

**El cliente no manda datos.** El servidor lee la pregunta y los conteos de Redis con la misma
lógica que ya usa `verNube`. Así nadie puede mandar cuatro mil palabras inventadas para quemar
presupuesto, y el plan siempre se calcula sobre el estado real.

**Autorización: `exigirProfesor`**, la misma que protege cerrar la votación y borrar palabras.
Solo quien creó la sala puede gastar. El límite por IP existente (`MAX_ENVIOS_POR_IP`) queda como
segundo cinturón, más un tope de 30 depuraciones por sala en las 6 horas de TTL, con el mismo
`incrConTtl` que ya usa el sistema.

**Respuesta 200:**

```json
{
  "correcciones": [{ "variante": "diafrahma", "correcta": "diafragma" }],
  "cercanias":    [{ "termino": "diafragma", "cerca": ["apertura", "entrada de luz"] }]
}
```

**Todos los campos son grafía visible**, no claves normalizadas: es lo que el modelo vio en el
prompt y lo único que puede devolver con sentido. El servidor traduce cada `variante`, `termino` y
elemento de `cerca` a su `clave` usando el mismo mapa que armó el prompt; lo que no se pueda
traducir se descarta (regla 1 de la sección 7). `correcta` no se traduce: es la grafía nueva que
va a mostrar la nube.

**Errores:** 403 sin token de profesor, 404 sala o pregunta inexistente, 429 tope alcanzado,
502 si Anthropic falla o devuelve algo inválido. Nunca se devuelve un plan a medias.

---

## 6. El prompt

Vive como una constante al inicio de `api/_lib/ia.js`, en un solo lugar, para que ajustarlo no sea
tocar lógica.

### Instrucción de sistema

> Sos el asistente de una herramienta de aula. Un docente proyectó una pregunta y sus alumnos
> respondieron con palabras o frases cortas, de forma anónima. El resultado se ve como una nube de
> palabras en un proyector.
>
> Tu trabajo tiene dos partes.
>
> **Correcciones.** Detectá respuestas que son la misma palabra mal escrita: erratas, tildes
> faltantes, letras cambiadas, singular y plural del mismo sustantivo. Devolvé cada una junto a su
> forma correcta. La forma correcta es esa misma palabra bien escrita, nunca otra palabra:
> «diafrahma» se corrige a «diafragma», no a «apertura».
>
> **Cercanías.** Para los términos más repetidos, indicá qué otras respuestas de la lista se
> refieren a lo mismo con otras palabras, o son parte del mismo concepto dentro de esta pregunta.
> Solo podés nombrar respuestas que estén en la lista.
>
> Cuatro reglas:
> - Nunca juzgues si una respuesta es correcta o incorrecta. No es tu tarea, y esto se proyecta
>   delante del curso.
> - Corregí ortografía solo cuando estés seguro. Ante la duda, dejá la respuesta como está: una
>   nube con una errata es mejor que una nube con una palabra que nadie escribió.
> - Si dos respuestas son conceptos distintos, no las juntes. Que compartan tema no las hace lo
>   mismo.
> - Podés devolver listas vacías. Es una respuesta válida y frecuente.

### Mensaje del usuario

Armado por el servidor con lo que hay en Redis:

```
Pregunta proyectada: "¿Qué controla la profundidad de campo?"

Respuestas y cuántas veces apareció cada una:
diafragma — 12
apertura — 7
diafrahma — 3
distancia al sujeto — 2
```

### Por qué está escrito así

**«Podés devolver listas vacías» es la línea que más pesa.** A un modelo al que le pedís agrupar,
agrupa: inventa parentescos entre respuestas que no los tienen, para no parecer inútil. Con esa
línea el silencio es una salida legítima.

**«Ante la duda, dejá la respuesta como está» va con su razón explicada.** Una instrucción con el
porqué se sigue mejor que una en mayúsculas.

**No hay `CRÍTICO:` ni `NUNCA JAMÁS` ni énfasis apilado.** Los modelos actuales siguen el prompt de
cerca; el énfasis escrito para modelos viejos hoy provoca el problema opuesto —que corrija de más.

### Parámetros de la llamada

```
POST https://api.anthropic.com/v1/messages
x-api-key: $ANTHROPIC_API_KEY
anthropic-version: 2023-06-01

model: "claude-haiku-4-5"
max_tokens: 1024
output_config.format: { type: "json_schema", schema: … }
```

Sin `thinking` y sin `effort`: Haiku 4.5 no acepta `effort`, y esta tarea no necesita razonamiento
extendido. **Salidas estructuradas** con esquema JSON, así la respuesta viene garantizada como JSON
parseable — no hay que reintentar por texto mal formado. La primera pulsada de cada día es algo más
lenta porque el esquema se compila; después queda en caché 24 horas.

---

## 7. Validación del plan

Tres reglas en el servidor, antes de devolver nada. Son lo que impide que aparezca en el proyector
algo que nadie escribió.

1. **Existencia.** Toda `variante`, todo `termino` y todo elemento de `cerca` tiene que existir en
   los conteos reales. Lo que no exista se descarta en silencio.
2. **Distancia de edición.** `correcta` tiene que estar a ≤3 caracteres de distancia de la grafía
   de `variante`, o ≤40% de su largo, lo que sea mayor. Eso la obliga a ser una corrección de
   ortografía y no una reescritura: puede convertir «diafrahma» en «diafragma», no en «obturador».
3. **Sin cadenas ni ciclos.** Una `variante` no puede ser a su vez `correcta` de otra. Si el modelo
   propone A→B y B→C, se descarta la segunda. Evita que la fusión dependa del orden.

Si tras validar no queda nada, se devuelve `{"correcciones": [], "cercanias": []}` con estado 200.

---

## 8. Aplicación del plan en el cliente

`js/plan.js` exporta una función pura:

```js
aplicarPlan(palabras, plan) → palabras
```

`palabras` es lo que ya devuelve `GET …/nube`: `[{ clave, texto, conteo }]`. La función:

- suma el conteo de cada variante a su término correcto,
- usa la grafía corregida como `texto`,
- elimina la variante de la lista,
- reordena por conteo, con el mismo desempate alfabético por `clave` que usa `verNube`, para que
  el resultado sea estable entre repintados.

**El plan vive en `profesor.js` como estado en memoria y se reaplica en cada pintado.** Si llegan
respuestas nuevas —o si el sondeo sigue corriendo— las correcciones se les siguen aplicando sin
volver a llamar a la API. Si se recarga la página, vuelve la nube cruda: Redis nunca se toca, y lo
que respondieron los alumnos queda intacto.

---

## 9. Errores y casos borde

| Caso | Comportamiento |
|---|---|
| Sin `ANTHROPIC_API_KEY` en el entorno | 502, mensaje en pantalla, nube intacta |
| Anthropic devuelve 429 o 5xx | 502, *"No se pudo depurar. Volvé a pulsar."* Sin reintento automático |
| Respuesta que no valida contra el esquema | 502. No se aplica nada parcial |
| Plan válido pero vacío | 200, *"nada que depurar"* |
| Sala o pregunta expirada a mitad de camino | 404, mensaje normal de sala inexistente |
| Se pulsa Depurar dos veces | El botón queda inhabilitado mientras corre |
| Se depura, luego se lanza otra pregunta | El plan se descarta: es por pregunta, no por sala |
| Modo nocturno | La línea de cercanías usa la rampa de `tono.js`, sin color propio |

**No hay reintento automático a propósito.** El SDK lo daría gratis, pero se descartó el SDK para
conservar cero dependencias. El botón se vuelve a pulsar, que en una sala es más rápido y más
predecible que una espera silenciosa que se alarga.

---

## 10. Pruebas

**Puras, con `node --test`** (`test/plan.test.js`, `test/ia.test.js`):

- `aplicarPlan` suma conteos y usa la grafía corregida.
- `aplicarPlan` con plan vacío devuelve la lista idéntica.
- El orden resultante es estable ante empates.
- La validación descarta términos que no están en los conteos.
- La validación descarta una `correcta` demasiado lejana («diafrahma» → «obturador»).
- La validación descarta cadenas A→B→C.
- Un plan que queda vacío tras validar devuelve 200, no error.
- `rutas.test.js`: 403 sin token de profesor; 404 con sala inexistente; tope por sala.

**Ciclo de `/pruebas`:** una llamada real a la API, también cuando se apunta a producción. Cuesta
medio centavo de dólar por corrida y es deliberado — apuntar `/pruebas` a producción es lo que
encontró 3 de los 4 bugs que solo aparecían desplegado, y el camino que solo falla desplegado
(clave ausente, variable de entorno mal nombrada, CORS) no se cubre de otra forma.

---

## 11. Qué queda fuera a propósito

- **Declarar conceptos esperados.** Descartado arriba: cuesta quince segundos por pregunta.
- **Juicio conceptual sobre respuestas.** Descartado arriba: proyecta un juicio sobre alguien.
- **Persistir la fusión en Redis.** Sin botón de deshacer, un plan equivocado quedaría clavado, y
  la escritura correría contra el sondeo de 2 segundos.
- **Que el alumno vea el análisis en su teléfono.** Obligaría a que 30 teléfonos consulten de
  fondo, que es una decisión ya rechazada en la spec original.
- **Streaming de la respuesta.** Un segundo y medio no necesita streaming, y agregaría manejo de
  SSE al cliente.
- **Historial de depuraciones.** El TTL de 6 horas se lleva todo, como el resto del sistema.

**Regla de gobierno vigente:** si aparece una necesidad docente nueva que no sea una nube de
palabras, se construye como otra herramienta pequeña en `utilidades/`, nunca como una función más
de esta.

---

## 12. Costo

Cada pulsada manda ~650 tokens de entrada y recibe ~300 de salida. Con `claude-haiku-4-5` a
US$1 y US$5 por millón:

| | |
|---|---|
| Por pulsada | ~US$0,002 |
| Tope por sala (30 depuraciones) | US$0,06 |
| Semestre (5 preguntas × 4 clases × 15 semanas) | ~US$0,60 |
| Corrida completa de `/pruebas` | US$0,002 |

El costo no es una restricción de diseño. La latencia sí: por eso Haiku y no un modelo mayor.

---

## 13. Umbrales que este cambio cruza

Cuatro cosas que hasta hoy el proyecto no tenía. Quedan anotadas porque son las que hay que
revisar si algo se rompe.

1. **Un secreto.** `ANTHROPIC_API_KEY` como variable de entorno en Vercel. Se usa solo dentro de la
   función serverless; nunca llega al navegador.
2. **Un costo por uso.** Acotado arriba y con tope por sala.
3. **Una salida de datos a un tercero.** Las respuestas de los alumnos viajan a la API de
   Anthropic. Son palabras sueltas, anónimas, sin nombre ni identificador. **Si Duoc UC tiene
   política sobre enviar producción de estudiantes a un servicio de IA, esa política manda sobre
   esta spec.** Pendiente de confirmar con Juan.
4. **Segundos de espera en vivo.** El primer punto del sistema donde el proyector espera delante
   del curso. Mitigado con el modelo más rápido y con estado visible en el botón.
