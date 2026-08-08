# Nube de palabras para clase

Herramienta para validar en vivo la comprensión de un curso: lanzas una pregunta, los alumnos
responden desde su teléfono y las respuestas se proyectan como una nube donde el tamaño refleja
cuántos escribieron cada palabra.

Sin cuentas, sin instalación, sin datos personales de estudiantes. La sala se borra sola.

- **Diseño:** [`docs/superpowers/specs/2026-08-07-nube-palabras-design.md`](docs/superpowers/specs/2026-08-07-nube-palabras-design.md)
- **Pendientes:** [`BACKLOG.md`](BACKLOG.md)

---

## Cómo se usa en clase

**Profesor** (la pantalla que se proyecta):

1. Abre la app → **Abrir sala**. Aparece un QR grande y un código de 4 letras.
2. Escribe la pregunta → **Lanzar**.
3. La nube crece sola en pantalla. Si hace falta, **Ocultar nube** (para que nadie copie) o clic
   en una palabra para eliminarla.
4. **Cerrar votación** congela la nube para discutirla.
5. Para la siguiente pregunta: **Nueva pregunta**. **El código y el QR no cambian** — los alumnos
   solo tocan "Ver pregunta actual" en su teléfono.

**Alumno:** escanea el QR (o entra a `<dominio>/r` y tipea el código), escribe hasta 3 palabras,
envía. Listo.

Un F5 accidental en el proyector no pierde la sala: la pantalla se reengancha sola.

---

## Desarrollo local

```bash
npm run dev
```

Levanta `http://localhost:3000` con un almacén **en memoria**: no necesita credenciales ni red.
Para usar otro puerto: `node dev.js 3210`.

## Pruebas

Dos niveles, ninguno con dependencias.

**Lógica** — 64 pruebas con `node --test`: normalización, códigos de sala, codificador QR y el
contrato completo de la API contra un almacén en memoria.

```bash
npm test
```

**Ciclo de lanzamiento de preguntas** — abre `/pruebas` en el navegador y presiona *Correr el
ciclo*. Maneja la pantalla real del profesor dentro de un iframe y recorre abrir sala → lanzar →
responder → ocultar → cerrar → lanzar la siguiente, con 26 comprobaciones.

Lo que distingue a este ciclo: **no pregunta si un elemento tiene `hidden = false`, pregunta
quién pinta de verdad en ese punto de la pantalla** (`elementFromPoint`). Nació de un bug en el
que el QR de esquina estaba correctamente colocado y marcado como visible, pero un panel opaco
posterior en el DOM lo tapaba — dejando en pantalla el mensaje "escanea el QR" sobre el QR
tapado, un bloqueo del que la clase no salía.

Corre contra el servidor que sirva la página, así que **también sirve de prueba de humo después
de desplegar**: abre `https://<tu-dominio>/pruebas` y córrelo. Crea salas reales, que se borran
solas.

---

## Despliegue

El objetivo es que, una vez montado, **cada push a `main` despliegue solo**. No hay paso de
compilación ni dependencias que instalar.

La puesta a punto se hace **una sola vez y desde el navegador**: conectar un repositorio nuevo a
Vercel exige conceder acceso a la app de GitHub, y ni el Root Directory ni la base de datos se
pueden fijar desde la línea de comandos.

### 1. Importar el repo (una vez)

En Vercel: *Add New → Project → Import Git Repository*.

- Si `utilidades` no aparece en la lista, usa el enlace **Adjust GitHub App Permissions** de esa
  misma pantalla y dale acceso al repo. Es el paso que bloquea todo lo demás.
- **Root Directory → Edit → `nube-palabras`.** Imprescindible: el repo es una colección, y sin
  esto Vercel busca `vercel.json` y la carpeta `api/` en la raíz, no los encuentra, y publica un
  sitio sin backend. El fallo no aparece al desplegar, sino al intentar abrir una sala.
- Framework Preset: *Other*. Sin comando de build.

### 2. Conectar la base Redis

En el proyecto: pestaña *Storage* → añadir **Upstash Redis**. Vercel inyecta
`UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`, que es exactamente lo que la app lee. Si
la creas en upstash.com, copia esas dos variables a mano en *Settings → Environment Variables*.

Vuelve a desplegar después de añadirla. Si se te olvida, la app lo dice con todas sus letras:
*"Falta conectar la base Redis"*.

El plan gratuito sobra: una pregunta consume del orden de 250 comandos.

### 3. Verificar

Abre `https://<tu-dominio>/pruebas` y corre el ciclo: 26 comprobaciones sobre la pantalla real,
15 segundos.

> **Regla antes de la primera clase:** prueba de humo con 3 teléfonos distintos respondiendo a la
> vez. La primera vez que esto corra frente a 30 personas no puede ser la primera vez que corre.

### Después

Cada push a `main` publica en producción. Cada push a otra rama genera una previsualización.

---

## Estructura

```
index.html            Pantalla del profesor (proyector)
r.html                Pantalla del alumno (teléfono)
css/estilo.css        Capa visual v1: neutra y funcional
js/normalizar.js      Agrupación de palabras (puro, compartido, testeado)
js/codigo.js          Códigos de sala (puro, compartido, testeado)
js/qr.js              Codificador QR propio (testeado)
js/nube.js            Layout de la nube en espiral, estable
js/profesor.js        Lógica de la pantalla del profesor
js/alumno.js          Lógica de la pantalla del alumno
pruebas.html          Ciclo de prueba del lanzamiento de preguntas (/pruebas)
js/ciclo.js           El ciclo en sí: maneja la pantalla real y comprueba oclusión
api/[...ruta].js      Entrada de la API en Vercel
api/_lib/rutas.js     Lógica de la API (sin transporte ni almacén)
api/_lib/store-*.js   Almacenes intercambiables: Redis y memoria
dev.js                Servidor local (estáticos + API)
test/                 Pruebas con node --test
```

Vanilla, módulos ES, **sin build tools y sin dependencias de npm**.

---

## Decisiones que conviene no deshacer sin pensarlo

- **Los teléfonos no consultan al servidor de fondo.** Escriben una vez y se detienen; el alumno
  toca "Ver pregunta actual" cuando el profesor lo dice. Es lo que mantiene el costo en nada
  aunque haya 40 teléfonos en la sala.
- **El layout de la nube es estable:** una palabra ya puesta nunca se mueve, solo escala. Si se
  reordenara cada 2 segundos, proyectada sería ilegible.
- **La normalización no fusiona singular con plural.** Uniría "lente/lentes", pero destrozaría
  "análisis", "crisis" y "lunes". Dos globos separados y correctos son mejores que una fusión
  que a veces miente.
- **La ñ se protege antes de quitar acentos.** Sin eso, "año" se fusiona con "ano" — proyectado
  frente a un curso.
- **Todo control exige el token de profesor**, generado al crear la sala y nunca proyectado. Es
  el único control de acceso: sin él, un alumno con el código podría cerrar la votación.
- **Nada puede dejar la pantalla en blanco.** Si la red falla, se avisa en una esquina y la nube
  que ya está se queda donde está.
- **Nada puede tapar el QR.** Es la única forma de entrar a la sala. Los `z-index` de
  `.ingreso--esquina` y `.aviso-grande`, y el `pointer-events: none` del velo del diálogo, están
  puestos por eso — no son decoración. El ciclo de `/pruebas` los vigila.
