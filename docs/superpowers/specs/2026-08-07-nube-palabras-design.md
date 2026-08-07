# Nube de palabras para clase — Diseño

**Fecha:** 2026-08-07
**Autor:** Juan Tramolao (docencia, Duoc UC)
**Estado:** aprobado en brainstorming, pendiente de plan de implementación

---

## 1. Propósito

Herramienta web para validar en vivo la comprensión de un curso: el profesor lanza una
pregunta, los alumnos responden desde su teléfono, y las respuestas se proyectan como una
nube de palabras donde el tamaño refleja cuántos las escribieron.

Equivalente funcional a la nube de palabras de Mentimeter, sin sus límites (2 preguntas por
presentación en el plan gratuito), sin cuentas y sin marca ajena en el proyector.

**Contexto de uso:** clases de Juan en Duoc UC. Sesiones de ~1h20. Uso esporádico dentro de
la clase, transversal a todos los ramos.

**Criterio de éxito:** Juan la usa en una clase real, con alumnos reales, y la nube le muestra
algo sobre la comprensión del curso que no habría visto preguntando en voz alta.

---

## 2. Decisiones tomadas

| Decisión | Elegido | Descartado, y por qué |
|---|---|---|
| Mecánica | Sala en vivo, alumnos responden desde el teléfono | "Tú pegas el texto": pierde la razón de ser de la herramienta |
| Identidad | Anónimo total, sin login | Nombre a mano: sesga las respuestas (autocensura). Magic link: mata el flujo en sala |
| Preguntas | Se improvisan en el momento | Biblioteca previa: obliga a cuenta de profesor y 4-5 pantallas de administración |
| Respuesta del alumno | Hasta 3 palabras sueltas | 1 palabra: pocos datos en cursos chicos. Frase libre: no forma nube |
| Arquitectura | Vercel Function + Upstash Redis, proyector con polling 2s | Supabase Realtime: más piezas, y el plan gratuito pausa el proyecto tras ~7 días sin uso |
| Revelado de la nube | Interruptor; por defecto en vivo | Siempre en vivo: sesgo de imitación sin escape. Siempre oculta: pierde el enganche |
| Alcance de la sala | Sala = clase; varias preguntas dentro | Sala = pregunta: rescanear el QR en cada pregunta rompe el ritmo. Actualización automática en teléfonos: más código y riesgo de costo |

**Observación que ordena la arquitectura:** el tráfico es asimétrico. 30 teléfonos solo
*escriben* (un POST y se van). Una sola pantalla — el proyector — necesita *leer* en vivo.
No hace falta infraestructura de tiempo real para 30 clientes: hace falta para uno. Por eso
el polling de 2 segundos es suficiente y el costo se mantiene trivial.

---

## 3. Alcance

### v1 construye

- Abrir sala de clase → código de 4 letras + QR
- Lanzar una pregunta dentro de la sala; varias preguntas sucesivas por sala
- El alumno envía hasta 3 palabras
- Nube proyectada, actualizada cada 2 segundos, con interruptor de ocultar/mostrar
- Cerrar la votación de una pregunta (congela la nube)
- Eliminar una palabra con un clic (moderación)
- Contador de participantes
- Lista "Mis salas de hoy" en el navegador del profesor
- Autodestrucción de la sala a las 6 horas

### v1 NO construye (va al BACKLOG)

- **Identidad visual Duoc UC** — fase 2, inmediatamente después de v1
- Fusionar dos términos a mano en el proyector
- Exportar la nube como imagen (la captura de pantalla del sistema lo resuelve)
- Otros formatos de pregunta (escala, opción múltiple, muro de respuestas)
- Historial de sesiones más allá de las 6 horas
- Lista de palabras vacías (stopwords)
- Cuentas, login, panel de administración, analytics

### Estética en v1

**Cero tokens de Libraphotos.** Esta herramienta es docencia, no fotografía; son marcas
que no se mezclan.

v1 usa una capa visual **neutra y funcional**: gris/negro, contraste alto, tipografía muy
grande. Esto no es decoración pospuesta — **la nube debe leerse desde la última fila a 10
metros**, y eso es un requisito funcional, no estético.

La paleta institucional de Duoc UC entra en fase 2. Los códigos exactos se obtienen del
manual de marca de Juan o se extraen de duoc.cl y se confirman con él antes de aplicarlos.
No se inventan.

---

## 4. Arquitectura

### Ubicación y stack

- **Carpeta:** `~/Claude/Projects/nube-palabras/` — repo git propio, fuera de LIBRAPHOTOS
- **Deploy:** Vercel
- **Front:** HTML/CSS/JS vanilla con módulos ES, **sin build tools** — mismo patrón que
  `exposicion.foto`, que lleva años vivo pesando 192 KB (regla 6 del método: superficie pequeña)
- **Backend:** una Vercel Function
- **Almacenamiento:** Upstash Redis, todo con expiración automática

### Piezas

| Archivo | Rol |
|---|---|
| `index.html` | Pantalla del profesor: crear sala, lanzar preguntas, proyectar la nube, moderar |
| `r.html` | Pantalla del alumno: ver la pregunta activa, enviar hasta 3 palabras |
| `api/[...ruta].js` | Function única: enrutamiento de todos los endpoints |
| `js/normalizar.js` | Normalización de palabras (función pura, testeada) |
| `js/codigo.js` | Generación y validación de códigos de sala (función pura, testeada) |
| `js/nube.js` | Layout de la nube en espiral (cliente) |
| `test/*.test.js` | Pruebas con `node --test`, sin frameworks |

### Modelo de datos (Redis)

```
sala:ABCD                      hash  { creada, preguntaActiva, tokenProfesor }
sala:ABCD:p:<n>                hash  { texto, estado: "abierta"|"cerrada", creada }
sala:ABCD:p:<n>:palabras       hash  { <normalizada>: <conteo> }
sala:ABCD:p:<n>:formas         hash  { "<normalizada>::<original>": <conteo> }
sala:ABCD:p:<n>:cuota          hash  { <tokenDispositivo>: <palabrasEnviadas> }
```

**Todas las claves llevan `EXPIRE` de 6 horas, y el TTL se renueva en cada escritura.** Así
una clase de 1h20 nunca vence a mitad de camino, y una sala olvidada desaparece sola.

**No se guarda quién dijo qué.** Ese dato no existe en ningún momento, ni siquiera de forma
transitoria: la palabra se suma al contador agregado y el token del dispositivo solo se usa
para el tope de 3, en una estructura separada que no se cruza con las palabras.

`formas` guarda cuántas veces se escribió cada variante original de una palabra, para poder
**mostrar la forma más escrita por los alumnos** en vez de la versión normalizada.

### Salas simultáneas

Cada sala es un conjunto de claves independiente con su propio TTL. Juan puede tener la sala
de las 10:00 todavía viva mientras abre la de las 11:40. No hay límite ni interferencia.

### Autorización sin cuentas

Al crear la sala se genera un **token de profesor** aleatorio que se guarda en el navegador
de Juan y **nunca se muestra en pantalla ni se proyecta**. Todas las acciones de control —
lanzar pregunta, cerrar votación, eliminar palabra — lo exigen.

Sin esto, cualquier alumno que ve el código de 4 letras podría cerrar la votación o borrar
palabras. Es el único control de acceso del sistema y no es opcional.

### Estado en el navegador del profesor

Guardado localmente, sin servidor y sin cuenta:

- **Token de profesor y código de la sala activa** — permiten que una recarga accidental
  reenganche la pantalla sin perder el control de la sala
- **"Mis salas de hoy"** — lista corta de las salas abiertas hoy (código + primera pregunta),
  para volver a cualquiera con un clic cuando Juan pasa de un curso a otro
- **Estado del interruptor de revelado** — mostrar/ocultar la nube es una decisión puramente
  local del proyector: no viaja al servidor ni afecta a los alumnos

### Endpoints

| Método | Ruta | Quién | Qué hace |
|---|---|---|---|
| `POST` | `/api/sala` | profesor | Crea sala. Devuelve `{ codigo, tokenProfesor }` |
| `POST` | `/api/sala/:cod/pregunta` | profesor | Lanza pregunta. Cierra la anterior si seguía abierta |
| `POST` | `/api/sala/:cod/pregunta/:n/cerrar` | profesor | Congela la nube |
| `DELETE` | `/api/sala/:cod/pregunta/:n/palabra/:norm` | profesor | Modera |
| `GET` | `/api/sala/:cod` | alumno | Pregunta activa y si acepta respuestas |
| `POST` | `/api/sala/:cod/palabras` | alumno | Envía `{ token, palabras[] }` |
| `GET` | `/api/sala/:cod/pregunta/:n/nube` | proyector | `{ palabras, participantes, estado }` — cada 2s |

---

## 5. Flujos

### Profesor

1. Abre la app y presiona **Abrir sala** → código de 4 letras + QR gigante en pantalla
2. Escribe la pregunta y presiona **Lanzar** → los alumnos ya pueden responder
3. La nube crece en pantalla; el contador de participantes sube
4. Si hace falta: **Ocultar nube** (para preguntas donde el sesgo de imitación importa),
   o clic en una palabra para eliminarla
5. **Cerrar votación** → la nube se congela y se discute con el curso
6. Para la siguiente pregunta: escribe la nueva y **Lanzar**. **El código y el QR no cambian**
7. Termina la clase, cierra la pestaña. A las 6 horas la sala se borró sola

### Alumno

1. Escanea el QR (o tipea la URL corta con el código, como respaldo)
2. Ve la pregunta arriba y tres campos de una palabra cada uno
3. Escribe 1, 2 o 3 palabras → **Enviar** → confirmación "listo"
4. Cuando el profesor lanza la pregunta siguiente, **recarga la página a su señal** y ve la nueva

El QR es el camino principal: nadie tipea nada, escanean y están dentro en 3 segundos. La URL
escrita existe solo para el teléfono que no lee QR.

Los teléfonos **no consultan al servidor de fondo**. Escriben una vez y se detienen. Ese es el
motivo de que el costo se mantenga trivial y de que el diseño elija "recargar a tu señal" por
sobre la actualización automática.

### Código de sala

4 letras mayúsculas, excluyendo caracteres confundibles a distancia o al tipear (sin `O`/`0`,
sin `I`/`1`, sin `L`). Generado al azar, verificando que no exista otro vivo con el mismo valor.

---

## 6. Normalización de palabras

Es lo que hace que la nube sirva. Si "Apertura", "apertura" y "apertura." cuentan como tres
términos distintos, no hay nube.

**Reglas aplicadas (todas seguras):**

1. Recortar espacios al inicio y al final; colapsar espacios internos
2. Comparar en minúsculas
3. Comparar sin tildes ni diéresis (`fotografía` = `Fotografia`)
4. Ignorar puntuación al final (`apertura.` = `apertura`)
5. **Mostrar** la forma original más escrita por los alumnos, no la versión normalizada

**Regla que NO se aplica:** unir singular con plural. "Lente/lentes" parece obvio, pero la
misma regla destroza `análisis`, `crisis`, `síntesis` y `lunes`. Dos globos separados y
legibles son mejores que una fusión que a veces miente. La fusión manual queda en el backlog.

**Validación de entrada:** máximo 30 caracteres por palabra, validado en el cliente y otra vez
en el servidor. Palabras vacías o solo con espacios se ignoran en silencio.

---

## 7. Layout de la nube

Algoritmo propio de **espiral de Arquímedes**, ~100 líneas, sin librerías. Es viable porque el
input está acotado: con ~30 alumnos × 3 palabras y agrupación por normalización, quedan ≤40
términos distintos en pantalla.

**Tamaño de fuente:** proporcional a la raíz cuadrada del conteo, acotado entre un mínimo
legible a 10 metros y un máximo que no desborde la pantalla.

**Requisito no negociable — el layout es estable.** Una palabra que ya está en pantalla **no
se mueve** cuando su conteo cambia: solo escala, con una transición de ~400ms. Las palabras
nuevas ocupan la siguiente posición libre de la espiral. Solo se recalcula todo el layout si
algo ya no cabe.

Sin esto, la nube se reordena cada 2 segundos y proyectada resulta mareante e ilegible.

**Plan B declarado:** si en pruebas con datos reales el resultado se ve mal, se vendoriza
`d3-cloud` como archivo local — sin npm, sin build.

---

## 8. Casos borde y manejo de errores

Criterio rector: **nada puede dejar a Juan con una pantalla en blanco frente al curso.**

| Situación | Comportamiento |
|---|---|
| Recarga accidental de la pestaña del proyector | La sala sigue viva. El código y el token quedan guardados en el navegador y la pantalla se reengancha sola. Un F5 no puede matar la clase |
| Se cae el wifi de la sala | El proyector muestra "Reconectando…" y **conserva la nube que ya tenía**. Nunca borra lo que estaba en pantalla |
| Al alumno se le corta la conexión al enviar | Reintento automático. El botón nunca dice "enviado" si no llegó |
| Código inválido o sala vencida | El alumno ve "Esta sala ya no existe", no un error técnico |
| Palabra vacía o de 200 caracteres | Tope de 30 caracteres; vacías se ignoran. Validado en cliente y servidor |
| Dos alumnos envían la misma palabra a la vez | `HINCRBY` es atómico. No hay carrera posible |
| Un alumno intenta enviar más de 3 palabras | Rechazado por el contador de cuota de su dispositivo |
| Upstash caído o inaccesible | El proyector conserva lo último y muestra aviso. El alumno ve un error claro, no una pantalla rota |
| Alumno abre la app sin pregunta activa | "Espera la próxima pregunta de tu profesor" |
| Alumno recarga y la pregunta está cerrada | "La votación se cerró. Espera la siguiente" — sin campos de entrada |
| Alumno ya respondió y recarga la misma pregunta | Ve su confirmación, no campos vacíos que inviten a reenviar |

### Anti-spam

Sin identidad, alguien podría mandar 50 palabras. Se controla con:

- Un identificador aleatorio por dispositivo guardado en el teléfono → **máximo 3 palabras por
  pregunta**
- Un tope por IP en el servidor (~20 envíos/minuto) contra el ataque burdo

Se puede burlar con modo incógnito, y está bien: **el adversario real es un alumno con 20
segundos de aburrimiento, no un bot.** Endurecerlo más costaría identidad, que es justamente
lo que el diseño decidió no tener.

### Moderación

Es un requisito, no un lujo: se proyecta texto anónimo escrito por alumnos ante todo el curso.
El profesor hace **clic en cualquier palabra de la nube y la elimina**, y desaparece de la
pantalla en menos de 2 segundos.

---

## 9. Pruebas

`node --test`, sin frameworks — mismo patrón que `exposicion.foto` (39 pruebas).

**Se testea lo que puede romperse en silencio:**

1. **Normalización** — tildes, mayúsculas, espacios dobles, puntuación final. Y casos
   negativos explícitos: `análisis` no se fusiona con nada por terminar en `s`; `crisis`
   tampoco
2. **Código de sala** — nunca genera caracteres ambiguos; detecta colisiones
3. **Contrato de la API** — crear sala, lanzar pregunta, enviar palabra, tope de 3, sala
   vencida, palabra inválida, acción de control sin token de profesor (debe fallar), con un
   doble de Redis en memoria

**No se testea con unit tests:** el layout de la nube. Se verifica a ojo, en el proyector.

**Regla no negociable antes de la primera clase:** prueba de humo con 3 teléfonos distintos
respondiendo a la vez. La primera vez que esto corra frente a 30 personas no puede ser la
primera vez que corre.

---

## 10. Riesgos declarados

- **Slots de portafolio.** Los 2 Activos están tomados (IMG-nation studio + tips-fotógrafos).
  Esto no cambia el diseño, pero construirlo exige pasar por `/semana` en vez de abrir un
  tercer frente en silencio.
- **Layout propio de la nube.** Es la única parte del diseño donde el resultado puede
  decepcionar visualmente. Mitigado por el plan B (vendorizar `d3-cloud`) y por el input acotado.
- **Límites del plan gratuito de Upstash.** El cálculo estimado (~250 comandos por pregunta,
  con el proyector como único lector) deja muchísimo margen, pero los límites exactos vigentes
  se verifican al momento de implementar, no se dan por sabidos.
- **Wifi de la sala.** Es la dependencia externa que el diseño no controla. Mitigado porque el
  proyector nunca borra lo que ya mostró.

---

## 11. Tamaño estimado

3 archivos principales, del orden de 600 líneas. Proyecto pequeño de verdad, alineado con la
regla 6 del método: *un archivo, un propósito, cero dependencias mientras se pueda.*

---

## 12. Cambios durante la implementación (2026-08-07)

La v1 está implementada. Lo que se desvió de este documento, y por qué:

- **La normalización quita puntuación en ambos extremos**, no solo al final. "¿apertura?" se
  normalizaba a "¿apertura" con la regla original.
- **Se agregó protección de la ñ.** Descomponer acentos convertía "año" en "ano", fusionando dos
  palabras muy distintas en una pantalla proyectada frente a un curso. No estaba previsto en el
  diseño y es la corrección más importante de la implementación.
- **Se deduplica dentro de un mismo envío.** Un alumno que escribe la misma palabra en los tres
  campos cuenta una vez; si no, podría triplicar su término favorito él solo.
- **Moderar pide confirmación** (clic en la palabra → "¿Eliminar «X»?" → Eliminar), en vez del
  clic único que decía el diseño. Borrar la palabra equivocada delante del curso es peor que el
  segundo extra que cuesta confirmar.
- **El QR se implementó acotado a versiones 1-5, corrección L y bloque único.** Cubre 106
  caracteres, de sobra para la URL de sala, y al ser bloque único evita la intercalación de
  bloques de corrección. La selección de máscara usa las reglas de penalización 1, 2 y 4 del
  estándar; se omite la 3, que solo afina la lectura en condiciones difíciles.
- **Se agregaron dos estados de pantalla** no previstos: "Esperando respuestas" cuando la
  pregunta está abierta y nadie ha respondido, y un botón "Salir" para soltar la sala.

### Verificación realizada

- 64 pruebas con `node --test`, todas en verde.
- **El codificador QR se verificó decodificando su salida con el detector de códigos del
  navegador**, que devolvió la URL exacta. Los bits de formato coinciden con la tabla de la norma
  ISO/IEC 18004, y la palabra de código Reed-Solomon se anula en las potencias de alfa que exige
  el estándar.
- Recorrido completo en el navegador: abrir sala, lanzar pregunta, 14 alumnos respondiendo,
  agrupación de variantes, "año" y "ano" separadas, moderación, ocultar/mostrar, cerrar votación,
  segunda pregunta con el mismo código, recarga del proyector y caída del servidor.
- **Estabilidad del layout medida, no supuesta:** tras tres votos nuevos que cambiaron el tamaño
  de varias palabras, ninguna se movió de su posición.

### Pendiente antes de usarla en clase

Prueba de humo con teléfonos reales y despliegue con Upstash. Ver `BACKLOG.md`.
