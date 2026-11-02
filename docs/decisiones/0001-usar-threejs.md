# 0001: Usar Three.js para la sala en 3D

**Estado:** aceptada

**Fecha:** 2026-11-02

## Contexto

Empezamos el cliente con Phaser, un motor 2D, y llegamos a mover un personaje con el teclado. Después decidimos que la sala debe ser en 3D, para que se sienta más como compartir una mesa de estudio.

La página puede quedar abierta durante horas junto a los apuntes, a menudo en un portátil con batería, así que debe consumir poco. La sala es cerrada, pequeña y con pocos objetos. Cambiar ahora es barato, porque todavía hay poco código.

## Decisión

Reemplazar Phaser por Three.js y construir una escena simple de pocos polígonos (low poly).

## Alternativas descartadas

- **Babylon.js:** es un motor más completo, pero más pesado, y trae mucho que no necesitamos.
- **Godot o Unity:** tienen editores potentes, pero una descarga inicial mucho mayor, y dejaríamos de usar TypeScript en el cliente.
- **Phaser con vista isométrica:** es lo más liviano y no cambia nada de lo hecho, pero no es 3D real.

## Consecuencias

- Hay que escribir el bucle principal y leer el teclado sin la ayuda de Phaser.
- Las colisiones las escribimos nosotros, comparando cajas. Una sala así no necesita un motor de físicas.
- La fase 1 se alarga, y con ella la llegada al MVP.
- Se mantienen Vite, TypeScript, el cálculo del movimiento y el plan de las fases siguientes.
- El ahorro de energía pasa a ser un requisito: la escena debe redibujarse muy poco mientras se estudia, y nada con la pestaña oculta.
