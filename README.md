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

Pruebas:

```bash
npm test
```

64 pruebas con `node --test`, sin frameworks ni dependencias.

---

## Despliegue

Requiere una base Redis de Upstash (el plan gratuito sobra: una pregunta consume del orden de
250 comandos).

1. **Crear la base:** en el panel de Vercel del proyecto, pestaña *Storage* → añadir **Upstash
   Redis**. Vercel inyecta solo `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`, que es
   exactamente lo que la app lee. Si la creas directamente en upstash.com, copia esas dos
   variables a mano en *Settings → Environment Variables*.
2. **Desplegar:** `vercel --prod` o conectando el repo. No hay paso de compilación.
3. **Verificar:** abre el sitio, abre una sala y responde desde tu propio teléfono antes de
   usarlo en clase.

> **Regla antes de la primera clase:** prueba de humo con 3 teléfonos distintos respondiendo a la
> vez. La primera vez que esto corra frente a 30 personas no puede ser la primera vez que corre.

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
