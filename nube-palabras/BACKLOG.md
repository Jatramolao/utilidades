# BACKLOG — Nube de palabras

Fuente de verdad de lo pendiente. El diseño vive en
[`docs/superpowers/specs/2026-08-07-nube-palabras-design.md`](docs/superpowers/specs/2026-08-07-nube-palabras-design.md).

**Estado 2026-08-12: ✅ EN PRODUCCIÓN — https://nubepalabras.vercel.app**

v1.1 (pantalla proyectada) desplegada. **90 pruebas de lógica** (`npm test`) + **45 del ciclo**
de `/pruebas`, todas en verde **corriendo contra producción**. Falta solo la prueba con muchos
teléfonos reales en sala.

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

### 🟡 Frente E · Análisis semántico y lectura contra objetivos — diseñado 2026-08-14

Spec: [`docs/superpowers/specs/2026-08-14-analisis-semantico-design.md`](docs/superpowers/specs/2026-08-14-analisis-semantico-design.md).

**Capa adicional sobre la nube que ya existe.** No toca nada del lado del alumno: mismo QR, mismo
formulario, mismas tres respuestas. No hay persistencia nueva — los objetivos viven en el hash
`sala:{codigo}` con el mismo TTL de 6 horas.

Botón **Analizar** con la votación cerrada. Manda pregunta, respuestas y objetivos de la clase a
`claude-sonnet-5` y recibe tres cosas: **grupos** (respuestas que dicen lo mismo, aunque estén
escritas distinto), **conexiones** entre grupos, y una **lectura** de dos o tres frases que compara
lo respondido contra los objetivos. En memoria, sin tocar Redis. Cero dependencias nuevas.
~US$0,013 por pulsada.

**Dos claves del diseño:** el modelo infiere a qué objetivo apunta *esa* pregunta y solo reporta
sobre ese —si no, las cinco preguntas de la clase dirían "faltaron los objetivos 2, 3 y 4"—; y el
mapa usa disposición determinista en anillo, no simulación de fuerzas, porque lo proyectado no se
mueve.

⚠️ **Este frente no salió de la bitácora: lo pidió Juan directamente.** Se anota así a propósito,
porque la Fase 0 existe para distinguir lo observado de lo supuesto. Resuelve de paso `M-01` y
`M-04`, que sí llevaban tiempo esperando evidencia.

#### Bloqueantes

- [ ] **E-00 · Confirmar si Duoc UC tiene política** sobre enviar producción de estudiantes a un
      servicio de IA. Si la hay, manda sobre la spec entera. Solo Juan puede responderlo.
- [ ] **E-0½ · Anotar los datos de una clase.** Cuántas respuestas distintas salieron de cuántos
      alumnos — ver spec §18. Decide si la agrupación aporta mucho o poco. La lectura contra
      objetivos sirve igual en los dos escenarios, así que este dato no bloquea la Fase 1 entera.

#### Fase 1 — lo que se puede usar en clase

- [ ] **E-01 · `ANTHROPIC_API_KEY` como variable de entorno en Vercel.** Nunca en el cliente.
- [ ] **E-02 · Objetivos de la clase:** diálogo, campo `objetivos` en el hash de la sala, ruta
      `POST /api/sala/:codigo/objetivos`. Ver spec §6.
- [ ] **E-03 · El análisis:** `api/_lib/ia.js`, ruta `analizar`, validación. Ver spec §7-§9.
- [ ] **E-04 · En pantalla:** `js/plan.js`, botón Analizar, deshacer, panel de lectura. Ver §10.
- [ ] **E-05 · Pruebas** puras + una llamada real en el ciclo de `/pruebas`. Ver spec §14.

#### Fase 2 — el mapa

- [ ] **E-06 · `js/mapa.js`:** disposición determinista en anillo y pintado en SVG. Ver spec §11.

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
- [ ] **M-05 · `index.html` tiene dos elementos con `id="conteos"`** (líneas 76 y 113), sobra el
      segundo. Es markup muerto que quedó de la corrección del solapamiento: `getElementById`
      devuelve el primero, así que el de la línea 113 nunca se muestra ni se actualiza. IDs
      duplicados además son HTML inválido. Borrar las cuatro líneas del segundo bloque.

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
