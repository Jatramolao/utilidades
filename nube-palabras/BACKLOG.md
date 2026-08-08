# BACKLOG — Nube de palabras

Fuente de verdad de lo pendiente. El diseño vive en
[`docs/superpowers/specs/2026-08-07-nube-palabras-design.md`](docs/superpowers/specs/2026-08-07-nube-palabras-design.md).

**Estado 2026-08-07:** v1 implementada y verificada de punta a punta en local. 64 pruebas de
lógica + 26 del ciclo de lanzamiento de preguntas (`/pruebas`), todas en verde. Falta desplegar
y probar con teléfonos reales.

**Corregido tras el reporte de Juan:** el QR quedaba tapado por los paneles a sangre y por el
diálogo de pregunta. Detalle de la causa raíz en la spec, §12.

---

## Antes de usarla en clase (bloqueante)

- [ ] **B-00 · Correr `/pruebas` contra el despliegue** una vez publicado. Son 26 comprobaciones
      sobre la pantalla real y toma 15 segundos.
- [ ] **B-01 · Prueba de humo con 3 teléfonos reales.** Escanear el QR con teléfonos distintos y
      responder a la vez. El codificador QR está verificado decodificándolo con el detector de
      códigos del navegador, pero una cámara real en una sala con proyector es otra cosa.
- [ ] **B-02 · Crear la base de Upstash y desplegar en Vercel.** Ver el README.
      ⚠️ El repo es una colección: al importar en Vercel hay que fijar
      **Root Directory = `nube-palabras`**, si no no encuentra `vercel.json` ni la API.
- [ ] **B-03 · Elegir dominio.** Los alumnos tipean la URL solo como respaldo, pero cuanto más
      corta, mejor. Hoy la URL de respaldo es la que dé Vercel.

---

## Fase 2 — Identidad Duoc UC

- [ ] **F2-01 · Conseguir la paleta institucional.** Del manual de marca de Juan o extraída de
      duoc.cl y confirmada por él. **No inventar códigos.**
- [ ] **F2-02 · Aplicar la paleta.** Toca solo las variables al inicio de `css/estilo.css`.
      Verificar contraste: la nube tiene que leerse desde la última fila.
- [ ] **F2-03 · Tipografía institucional**, si la hay y si carga rápido. Si obliga a un webfont
      pesado, no vale la pena: la fuente del sistema no le falla a nadie.

---

## Mejoras admitidas (sin fecha)

- [ ] **M-01 · Fusionar dos términos a mano.** Arrastrar una palabra sobre otra en el proyector
      para unirlas. Resuelve el caso singular/plural que la normalización automática se niega a
      adivinar.
- [ ] **M-02 · Auditoría de accesibilidad.** Navegación por teclado en la nube, foco visible,
      lectura de la nube por lector de pantalla.
- [ ] **M-03 · Exportar la nube como imagen.** Baja prioridad: la captura de pantalla del sistema
      ya lo resuelve.
- [ ] **M-04 · Lista de palabras vacías** (artículos, preposiciones) para preguntas donde alguien
      responde con una frase.

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
