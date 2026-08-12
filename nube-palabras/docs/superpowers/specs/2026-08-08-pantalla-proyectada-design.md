# Pantalla proyectada v1.1 — Diseño

**Fecha:** 2026-08-08
**Origen:** Fase 0 — feedback de Juan tras la primera clase real (ver [`BITACORA.md`](../../../BITACORA.md))
**Estado:** aprobado, en implementación

---

## 1. De dónde sale esto

La herramienta se usó en clase y funcionó: los términos se desplegaron bien y la interacción con
los alumnos estuvo bien. Las tres cosas que Juan echó de menos son **todas de la pantalla
proyectada**, ninguna de la mecánica:

1. La nube se ve estática. Falta movimiento para que resulte atractiva.
2. El tamaño muestra cuál se repitió más, pero no **cuántas veces**.
3. Modo nocturno, según cómo esté la sala.

**Dato que valida la Fase 0:** ninguna de las dos mejoras que yo había supuesto —cronómetro y
"ver resultados en el teléfono"— apareció en el feedback. Se quedan en el backlog sin abrir.

---

## 2. Decisiones tomadas

| Decisión | Elegido | Descartado, y por qué |
|---|---|---|
| Tipo de movimiento | Eventos con energía **+** respiración continua sutil | Solo eventos: la nube congelada se discute 10 minutos y vuelve a verse muerta. Solo respiración: se pierde el enganche de ver aparecer *tu* palabra |
| Implementación | CSS puro, desfase por palabra | `requestAnimationFrame`: un bucle toda la clase compite con el sondeo. Librería: rompe cero dependencias |
| Panel de conteos | Al cerrar la votación, con botón para adelantarlo | Siempre visible: refuerza el sesgo de imitación. Solo manual: una decisión más en medio de la clase |
| Modo nocturno | Interruptor manual, recordado, arranca en claro | Automático por sistema: decide por la hora del día, no por la luz de la sala |

---

## 3. Movimiento

### Respiración

Cada palabra oscila hasta **3 px** en ciclos de **4,5 a 7,5 s**, con duración y desfase
aleatorios por palabra para que el conjunto nunca lata al unísono.

Se implementa en la propiedad CSS **`translate`**, que es independiente de `transform` y se
compone con ella. La posición sigue viviendo en `transform`, así que **la respiración no puede
alterar la colocación**: oscila alrededor del sitio asignado y vuelve.

### Entrada y latido

- **Entrada:** al fundido actual se le suma una escala desde el 85%.
- **Latido:** cuando una palabra sube de conteo, un pulso de escala de 600 ms.

### La regla que no se toca

**Una palabra que ya está en pantalla no cambia de sitio.** Sigue siendo la regla dura del
diseño original: una nube que se reordena cada 2 segundos, proyectada, es ilegible.

### Consecuencia obligatoria en la detección de choques

Hoy se dejan **6 px** de aire entre palabras. Si dos vecinas respiran 3 px la una hacia la otra,
se tocan. Con la respiración activa la separación mínima sube a **12 px** (`6 + 2 × amplitud`).

Sin este ajuste, el dinamismo reintroduce por la puerta de atrás el bug de palabras encimadas
que costó encontrar en producción.

### Accesibilidad

Con `prefers-reduced-motion: reduce` no hay respiración, ni latido, ni escala de entrada. La
nube se comporta como hoy.

---

## 4. Panel de conteos

- **Dónde:** tarjeta abajo a la izquierda, espejando la del QR (abajo a la derecha).
- **Qué:** las **5 palabras más repetidas** con su número — `luz — 7`.
- **Cuándo:** aparece automáticamente al **cerrar la votación**. Un botón en la barra lo muestra
  o esconde en cualquier momento.
- **Con la nube oculta, el panel también se esconde.** Mostrar los números anularía exactamente
  lo que protege el botón "Ocultar nube".
- **Orden:** el que ya entrega la API (conteo descendente, empates alfabéticos), que es estable
  entre consultas.
- **Pantallas bajas** (≤ 620 px de alto): se reduce a las **3** más repetidas.
- Si no hay palabras, el panel no aparece aunque esté activado.

---

## 5. Modo nocturno

- Atributo `data-tema="oscuro"` en el elemento raíz, accionado por un botón de la barra.
- Se recuerda en `localStorage` (`nube:tema`). **Arranca en claro** siempre en un navegador nuevo.
- Solo redefine los tokens de color del inicio de `css/estilo.css`.

### Dos restricciones duras

**La tarjeta del QR mantiene fondo claro y módulos oscuros, siempre.** Un QR invertido es poco
fiable para muchas cámaras, y ese QR es la única puerta de entrada a la sala. En modo oscuro la
tarjeta queda como un recuadro claro sobre fondo oscuro, que además la destaca más.

**El contraste de la nube se mantiene en ambos temas.** La rampa de color de las palabras se
invierte (claro sobre oscuro) conservando una relación de contraste mínima de **4,5:1** contra
el fondo, en todo el rango de conteos.

---

## 6. Cambios en el código

| Archivo | Cambio |
|---|---|
| `js/tono.js` | **Nuevo.** Rampa de color por conteo y por tema. Función pura y testeable |
| `js/nube.js` | Respiración, latido, separación 12 px, usa `tono.js` |
| `js/profesor.js` | Panel de conteos, interruptor de tema, persistencia |
| `js/ciclo.js` | Comprobaciones nuevas |
| `css/estilo.css` | Animaciones, tokens del tema oscuro, estilos del panel |
| `index.html` | Marcado del panel y dos botones |
| `test/tono.test.js` | **Nuevo.** Contraste en ambos temas, en todo el rango |

Extraer `tono()` a su propio módulo no es adorno: es lo que permite **probar el contraste con
`node --test`** en vez de confiar en el ojo. La lección de proyectos anteriores es que un gris
mal elegido pasa desapercibido hasta que alguien lo mide.

---

## 7. Pruebas

**Lógica (`npm test`):**
- Contraste ≥ 4,5:1 contra el fondo, en ambos temas, para conteos de 1 a 50.
- La palabra más repetida siempre queda más oscura (tema claro) o más clara (tema oscuro) que la
  menos repetida.
- La rampa nunca se sale del rango válido de luminosidad.

**Ciclo (`/pruebas`):**
- El panel de conteos aparece al cerrar la votación y sus números coinciden con la API.
- El panel se esconde al ocultar la nube.
- El interruptor de tema cambia el fondo y persiste tras recargar.
- **En tema oscuro, la tarjeta del QR sigue con fondo claro.**
- **El invariante de no solapamiento se mantiene con la respiración activa** — medido en el
  punto más desfavorable del ciclo de oscilación.

---

## 8. Riesgos

- **La respiración reintroduce solapamientos.** Mitigado subiendo la separación a 12 px y
  comprobándolo en el ciclo. Es el riesgo principal.
- **El tema oscuro en un proyector con mucha luz ambiente se lee peor**, no mejor. Por eso el
  interruptor es manual y arranca en claro: la sala decide.
- **Coste de rendimiento del movimiento continuo.** Mitigado usando solo `translate` y `scale`,
  que el compositor resuelve sin recalcular el diseño de la página.

---

## 9. Fuera de alcance

Identidad Duoc UC (frente B, sigue esperando la paleta), fusionar términos a mano, palabras
vacías, cronómetro y ver resultados en el teléfono. Nada de eso salió del feedback de clase.
