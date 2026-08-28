# BACKLOG — Nube de palabras

Fuente de verdad de lo pendiente. El diseño vive en
[`docs/superpowers/specs/2026-08-07-nube-palabras-design.md`](docs/superpowers/specs/2026-08-07-nube-palabras-design.md).

**Estado 2026-08-14: ✅ EN PRODUCCIÓN — https://nubepalabras.vercel.app**

v1.1 (pantalla proyectada) + lectura semántica desplegadas. **119 pruebas de lógica**
(`npm test`) + **65 del ciclo** de `/pruebas`, todas en verde **corriendo contra producción y
llamando de verdad a la API de Claude**. Falta solo la prueba con muchos teléfonos reales en sala.

⚠️ **Al commitear, el email de autor debe ser `jatramolao@gmail.com`.** Vercel rechaza el
despliegue con *"The commit author email is not a valid email address"* si se usa otro, y el
síntoma es un despliegue encolado en estado UNKNOWN que nunca construye.

Cuatro fallos aparecieron al publicar y están corregidos; los cuatro se detallan en la spec, §12:

- El QR quedaba tapado por los paneles a sangre y por el diálogo de pregunta.
- La integración de Upstash de Vercel crea las variables como `KV_*`, no `UPSTASH_REDIS_REST_*`.
- El catch-all `api/[...ruta].js` de Vercel resolvía un solo segmento: se enruta a mano.
- La nube medía anchos sobre elementos en transición, y las palabras se encimaban.

---

## 🔵 FASE ACTUAL — Fase 0: usarla y anotar

**Decidido con Juan el 2026-08-08.** No se abre ningún frente de construcción hasta tener
**2 o 3 clases reales anotadas** en [`BITACORA.md`](BITACORA.md).

**Por qué:** todo lo que aparece más abajo como "mejora" lo escribí suponiendo, antes de que la
herramienta se usara con alumnos. La regla 3 del método —medir antes de opinar— aplica igual
aquí. Y el riesgo real de este momento no es que falte algo: es que sobre. La herramienta
funciona en ~500 líneas, y su valor a tres años depende de que siga siendo pequeña.

**Criterio de cierre:** 2-3 entradas en la bitácora. Con eso se decide qué frente se abre, se
escribe la spec sobre observación en vez de suposición, y recién ahí se codea.

- [x] **F0-01 · Primera clase real, anotada en `BITACORA.md`** (2026-08-08). Funcionó; el
      feedback fue todo de la pantalla proyectada.
- [x] **F0-02 · Frente elegido:** *pantalla proyectada* (dinamismo, conteos, modo nocturno).
      Spec: `docs/superpowers/specs/2026-08-08-pantalla-proyectada-design.md`. **Implementado.**
- [ ] **F0-03 · Seguir anotando.** La Fase 0 no se cierra: cada clase nueva va a la bitácora.
      Es lo que evitó construir un cronómetro que nadie pidió.

---

## Ya resuelto

- [x] **B-00 · Correr `/pruebas` contra el despliegue.** 29/29 en producción, 2026-08-08.
- [x] **B-02 · Importar el repo en Vercel y conectar Upstash.** Hecho 2026-08-08.
      Si alguna vez hay que rehacerlo: Root Directory = `nube-palabras`, Upstash desde *Storage*,
      y redesplegar. Receta completa en el README.
- [~] **B-01 · Prueba con teléfonos reales.** Juan hizo una prueba corta el 2026-08-08 y funcionó.
      La validación de verdad —30 teléfonos a la vez, sala real, proyector— la absorbe la Fase 0.

---

## Frentes en espera (no abrir hasta cerrar la Fase 0)

Ordenados por lo que *sospecho* que pesa más. La bitácora manda sobre este orden.

### ✅ Frente D · Pantalla proyectada — hecho 2026-08-08 / 2026-08-13
- [x] Respiración continua, entrada con escala y latido al subir de conteo.
- [x] Panel con las 5 más repetidas y su número, al cerrar la votación.
- [x] Modo nocturno manual, con el QR siempre sobre fondo claro.
- [x] **QR ampliable** (2026-08-13, pedido tras usarla): la tarjeta de la esquina se pulsa y
      ocupa la pantalla completa para el que llega tarde; vuelve con otro clic o con Esc, y sola
      al lanzar la pregunta siguiente. Reusa la vista grande que ya existía.

### 🟡 Frente E · Lectura semántica — Fase 1 diseñada 2026-08-14

Spec: [`docs/superpowers/specs/2026-08-14-analisis-semantico-design.md`](docs/superpowers/specs/2026-08-14-analisis-semantico-design.md).

**Capa adicional sobre la nube. No toca nada del lado del alumno y no escribe nada en Redis.**

Botón **Lectura** con la votación cerrada. Manda la pregunta y todas las respuestas con sus conteos
a `claude-sonnet-5` y abre un panel con dos o tres frases sobre **qué está diciendo el curso**. Se
cierra con clic o Esc, igual que el QR ampliado. La nube no se toca: ni un píxel. ~US$0,004 por
pulsada.

**El riesgo del que se defiende el diseño:** que el panel diga "la más votada fue «diafragma» con
7", que es la nube dicha en prosa. El prompt le prohíbe listar y decir cuál ganó, y le pide lo que
la nube no puede mostrar — convergencia entre respuestas escritas distinto, división del curso,
una idea que rodean sin nombrar, o una minoría que aporta algo. Con una regla que pesa tanto como
esas cuatro: **si no hay patrón claro, decirlo y terminar** — sin eso, un modelo al que le pedís
interpretar le encuentra sentido al ruido.

Fases 2 a 4 (agrupación en la nube, objetivos de aprendizaje, mapa de conexiones) quedan diseñadas
en la §14 de la spec, sin construir. La Fase 1 no cierra ninguna de esas puertas.

⚠️ **Este frente no salió de la bitácora: lo pidió Juan directamente.**

#### Bloqueante

- [ ] **E-00 · Confirmar si Duoc UC tiene política** sobre enviar producción de estudiantes a un
      servicio de IA. Si la hay, manda sobre la spec entera. Solo Juan puede responderlo.

#### Fase 1 — ✅ EN PRODUCCIÓN desde 2026-08-14

- [x] **E-01 · `ANTHROPIC_API_KEY`** puesta por Juan en Vercel.
- [x] **E-02 · `api/_lib/ia.js`** y la ruta `POST /api/sala/:codigo/pregunta/:n/lectura`.
- [x] **E-03 · Botón y panel** en `index.html`, `js/profesor.js`, `css/estilo.css`.
- [x] **E-04 · Pruebas:** 119 de lógica + 65 del ciclo, en verde.
- [x] **E-04b · `/pruebas` contra producción**, con llamada real a la API: 65/65.

**Dos cosas se midieron y no coincidían con la spec:**

- El tope de 400 caracteres **truncaba las tres lecturas de tres**, comiéndose siempre la última
  frase (la observación sobre la minoría, que es lo que el prompt más pide). Subido a 600, y el
  ciclo ahora comprueba además que la lectura no termine en elipsis.
- **La latencia real es ~5,4 s**, en frío y en caliente, no los 2-4 estimados. Sin tocar: el único
  lever es apagar `thinking`, que se paga en calidad. Decidir después de usarla en clase.

- [ ] **E-06 · Anotar en la bitácora la primera clase con lectura.** Si cinco segundos molestan
      en sala, y si la lectura aporta algo que la nube no daba.

#### Antes de abrir la Fase 2

- [ ] **E-05 · Anotar los datos de una clase.** Cuántas respuestas distintas salieron de cuántos
      alumnos — ver spec §15. Decide si agrupar aporta mucho o poco. **No bloquea la Fase 1.**

### Frente A · Fricción de sala
- [x] **B-03 · Dominio corto.** Resuelto por Juan: `nubepalabras.vercel.app/r`. Es un alias del
      mismo proyecto `utilidades`, no un proyecto aparte.
- [ ] **A-01 · Cronómetro en pantalla.** "Tienen 60 segundos". ~40 líneas, solo cliente.
      ⚠️ Hipótesis mía, sin observar. Puede que no lo necesites nunca.
- [ ] **A-02 · Que el alumno vea la nube en su teléfono** tras responder, con un botón que
      consulta una vez (sin sondeo de fondo, que sigue rechazado).
      ⚠️ Hipótesis mía, sin observar.

### Frente C · Calidad de lo proyectado
- [ ] **M-01 · Fusionar dos términos a mano.** Resuelve singular/plural, que la normalización se
      niega a adivinar. Se valida solo si la bitácora muestra el problema.
- [ ] **M-04 · Palabras vacías**, para cuando alguien responde con una frase. Igual: solo si pasa.
- [x] **M-05 · `id="conteos"` duplicado en `index.html`.** Resuelto 2026-08-14: el segundo
      bloque era markup muerto de la corrección del solapamiento y se fue al agregar el panel de
      lectura, que ocupa ese mismo lugar del DOM.
- [ ] **M-06 · Qué pasa con las palabras que no caben.** `nube.js` encoge todo un 15% y reintenta
      hasta 8 veces; si tras eso algo sigue sin caber, no hay comportamiento definido para las
      palabras posteriores al fallo. Con respuestas largas y un curso grande puede significar
      respuestas que existen y nunca aparecen proyectadas. **Medir primero**: contar términos en
      el panel de conteos contra palabras dibujadas, en una clase real.

---

## Frente B · Identidad Duoc UC

- [ ] **F2-01 · Conseguir la paleta institucional.** Del manual de marca de Juan o extraída de
      duoc.cl y confirmada por él. **No inventar códigos.**
- [ ] **F2-02 · Aplicar la paleta.** Toca solo las variables al inicio de `css/estilo.css`.
      Verificar contraste: la nube tiene que leerse desde la última fila.
- [ ] **F2-03 · Tipografía institucional**, si la hay y si carga rápido. Si obliga a un webfont
      pesado, no vale la pena: la fuente del sistema no le falla a nadie.

---

## Sin fecha, fuera del primer corte

- [ ] **M-02 · Auditoría de accesibilidad.** Navegación por teclado en la nube, foco visible,
      lectura por lector de pantalla. Importante, no urgente.
- [ ] **M-03 · Exportar la nube como imagen.** La captura de pantalla del sistema ya lo resuelve.

---

## Regla de gobierno (2026-08-08)

Si aparece una necesidad docente nueva que **no sea una nube de palabras**, se construye como
**otra herramienta pequeña en `utilidades/`**, nunca como una función más de esta. Es lo que
impide que una app de dos pantallas se convierta en una plataforma que haya que mantener.

---

## Rechazado a propósito

- **Cuentas de profesor y biblioteca de preguntas previas.** Convertiría una app de dos pantallas
  en una de cinco. Las preguntas que sirven se guardan en las notas de clase.
- **Fusión automática de singular y plural.** Destroza "análisis", "crisis", "síntesis", "lunes".
- **Actualización automática en los teléfonos.** Obligaría a que 30 teléfonos consulten al
  servidor de fondo, con el costo y la caché que eso arrastra, para ahorrar una instrucción
  verbal que igual se da.
- **Identificar quién respondió.** Sesga las respuestas (autocensura) y agrega datos personales
  de estudiantes al sistema. La herramienta mide comprensión, no asistencia.
- **Historial de sesiones más allá de 6 horas.** Es lo que permite que no haya base de datos que
  administrar ni respuestas de alumnos guardadas para siempre.
