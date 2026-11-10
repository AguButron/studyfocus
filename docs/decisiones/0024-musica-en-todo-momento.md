# 0024: La música en todo momento, sin cortarse al salir de la sala

**Estado:** aceptada.

**Fecha:** 2026-11-09

## Contexto

La música ([0012](0012-musica-personal.md)) solo existía dentro de una sala o al estudiar solo. Además, salir de la sala recargaba la página entera para dejar la sala 3D limpia, así que la música se cortaba justo al volver al menú, y se perdía el ambiente.

## Decisión

- **La música está siempre** desde que se inicia sesión: en el menú, en la sala y al estudiar solo, en el mismo lugar abajo a la derecha. Se esconde al cerrar sesión.
- **Salir de la sala ya no recarga la página.** Se vuelve al menú con la música sonando. La sala 3D deja de dibujarse y se esconde, y la página deja de mandar el estado de la persona.
- **Entrar a la primera sala** desde el menú tampoco recarga: la música sigue.
- **Entrar a una segunda sala** en la misma visita sí recarga la página. La sala 3D se arma una sola vez por página, y volver a armarla sin recargar significaría deshacer y rehacer todo lo que prepara (el personaje, los demás, las teclas, el temporizador). La recarga entra directo a la sala nueva, retomando la sesión que la pestaña ya guardó, y es el único momento en que la música se reinicia.

## Alternativas descartadas

- **Desarmar la sala 3D al salir y volver a armarla:** evitaría también esa recarga, pero obliga a revisar cada pieza de la sala. Puede venir después.
- **Guardar dónde iba el video y seguir desde ahí tras recargar:** el reproductor insertado de YouTube no dice en qué segundo va sin cargar su API. Igual se oiría un corte.

## Consecuencias

- En el menú, el reproductor de YouTube (356 × 200 px) queda sobre el contenido, abajo a la derecha. Las reglas de YouTube exigen que se vea mientras suena; para quitarlo se elige "Sin música".
- `showHome` recibe una segunda función, para detener la sala al volver al menú.
- Si al reconectar el servidor ya liberó tu lugar y no se puede volver a entrar, la página se recarga como antes.
