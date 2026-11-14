# 0029: Estudiar solo en tu escritorio

**Estado:** aceptada. Reemplaza la pantalla simple de estudiar solo, que queda solo de respaldo.

**Fecha:** 2026-11-10

**Cambio del 2026-11-14:** ya no se entra con un botón "Estudiar solo" aparte. Es la primera de las salas, "Estudio individual" ([0031](0031-tipos-de-sala.md)).

## Contexto

Estudiar solo era solo el temporizador al centro, sin 3D. Se quiere algo más acogedor: ver a tu personaje estudiando en un lugar propio, como en la sala, pero tranquilo y sin elegir nada.

## Decisión

- **Un rincón, no una pieza completa:** el escritorio contra la ventana, la silla, una lámpara, una repisa con libros, una planta, un afiche y una alfombra. Es de noche, y la luz principal es la de la lámpara.
- **Ya sentado:** al entrar, el personaje está en su silla. No hay que elegir asiento ni existe "Cambiar de asiento".
- **Hace lo que eliges:** computador, leyendo o escribiendo, igual que en la sala. En el descanso se duerme sobre el escritorio.
- **Las cámaras (2026-11-11):**
  - Mientras pones el temporizador, se ve al personaje de frente, desde el otro lado de la ventana. La pared se esconde mientras la cámara está detrás de ella.
  - Al estudiar, la tecla C o el aviso del panel pasa entre tres vistas: **Primera persona** (el escritorio, lo que tiene en las manos y la ventana), **Escritorio** (de costado y desde arriba) y **Habitación** (todo el rincón, de lejos).
  - Son las mismas tres de la sala y se recuerda la misma elección. Solo cambian los nombres.
  - La cámara pasa de una vista a otra de a poco, y se mece lento.
  - En el celular, la primera persona abre el ángulo en vez de alejarse.
  - Hasta el 2026-11-11 había una sola vista, la de costado.
- **El mismo panel que en la sala:**
  - El temporizador, el ramo, los objetivos, la duración y la actividad, a la izquierda.
  - En el celular va abajo.
  - La imagen se corre hacia el lado libre para que el personaje quede al centro de lo que se ve, y en el celular la cámara se aleja.
- **Para volver al menú** está el logo del panel, como sentado en la sala.
- **Si el escritorio no se puede cargar,** queda la pantalla simple de antes.

## Alternativas descartadas

- **Una pieza completa para caminar:** no hace falta para estudiar, y la sala ya dejó de caminar (0027).

## Consecuencias

- **Un archivo nuevo, `client/src/deskScene.ts`:**
  - Arma el rincón una sola vez, sienta al personaje y dibuja 30 cuadros por segundo. Con 12, el vaivén y los cambios de cámara se veían a saltos.
  - **Tiene su propia escena de Three.js, con sus propias luces.** Hasta el 2026-11-11 usaba la de `scene.ts`, que es la de la sala. Si la sala ya se había descargado, sus mesas y su piso quedaban dentro del escritorio: los dos pisos a la misma altura parpadeaban, se dibujaba la sala entera sin verse y la página iba lenta. Además, el escritorio dejaba oscuras las luces de la sala.
  - Se descarga recién al entrar, igual que la sala.
  - Al volver al menú libera el lienzo.
- **`activity.ts` toma las medidas de `roomLayout.ts`, no de `room.ts`:** importar `room.ts` arma la sala completa, con sus mesas y sillas.
- **Lo que hay en el rincón está en `DESK_ITEMS`**, con su tipo y su lugar. Más adelante puede guardarse por cuenta para que cada persona arme el suyo.
- **El modo de la página sigue siendo `solo`.** El de respaldo se llama `simple`.
