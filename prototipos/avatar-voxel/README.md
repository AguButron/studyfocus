# Prueba del avatar pixel 3D

Prueba de estilo aparte del juego, usada para elegir el nivel de detalle del avatar. No forma parte de la aplicación.

Abre `prueba-avatar.html` en un navegador: funciona sin instalar nada. El código está en `src/main.ts`.

## Resultado

Se eligió este nivel de detalle, de unos 7.400 triángulos por personaje. Con 12 personajes y sombras se mantuvo a 120 cuadros por segundo en una RTX 5060 Ti.

## Antes de llevarlo al juego

- Medir el rendimiento en un portátil común.
- Dibujar los personajes y la ropa en MagicaVoxel, porque aquí están hechos con coordenadas en el código.
- Medir el consumo con personajes distintos entre sí, porque en esta prueba todos comparten el mismo modelo.
