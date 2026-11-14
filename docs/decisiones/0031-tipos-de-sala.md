# 0031: Cinco tipos de sala, de 2 a 16 personas

**Estado:** aceptada.

**Fecha:** 2026-11-14

## Contexto

Había un solo tipo de sala: un salón de 12 × 12 con cuatro mesas de cuatro (16 sillas), sin adornos. Un grupo de dos o tres amigos quedaba perdido en una sala enorme, y todas las salas se veían iguales. Se pidieron salas de 16, 12, 8, 4 y 2 personas, organizadas y decoradas de forma provisoria, hasta tener el arte de cada cosa.

## Decisión

| Sala | Personas | Medida | Mesas | Decoración |
|---|---|---|---|---|
| Estudio individual | 1 | — | Tu escritorio ([0029](0029-tu-escritorio.md)) | La suya: lámpara, repisa, planta, afiche y alfombra |
| Estudio de a dos | 2 | 6 × 5,5 | Una mesita, frente a frente | Ventana grande, lámpara de pie, sillón, afiche, mueble con planta, alfombra |
| Sala de grupo | 4 | 7 × 6,5 | Una de cuatro | Pizarra, reloj, estante, ventana, mueble con planta, plantas, alfombra |
| Café | 8 | 9 × 9 | Cuatro mesitas de a dos | Barra con cafetera, tazas y galletas, pizarra de menú, estantes, ventanas, plantas, alfombra |
| Biblioteca | 12 | 13 × 9 | Tres de cuatro, en fila | Estantes llenos de libros en tres paredes, lámparas verdes sobre las mesas, reloj, ventanas, alfombra larga |
| Salón de estudio | 16 | 12 × 12 | Cuatro de cuatro | La sala de antes, con ventanas, reloj, estantes, afiches, plantas y una alfombra por el pasillo |

- **Caben tantas personas como sillas.** Antes cabían 12 en una sala de 16 sillas, de cuando se podía estar de pie. Ahora todos necesitan silla ([0027](0027-elegir-asiento-con-un-clic.md)).
- **El Salón de estudio conserva el identificador `study`.** Así, las salas guardadas antes siguen abriéndose como Salón, y sus sillas mantienen el mismo número.
- **El estudio individual es una sala más (2026-11-14).** Ya no hay una opción "Estudiar solo" aparte: la primera tarjeta es el Estudio individual, que dice "Solo tú". Con ella elegida, el botón dice "Empezar a estudiar" en vez de "Crear sala" y lleva directo a tu escritorio, que sigue siendo privado: nadie más puede entrar, ni con el código.
- **Al crear una sala** se elige entre seis tarjetas, de la más chica a la más grande, con el plano de cada una (mesas, sillas, alfombras y muebles), una descripción y "Hasta N personas". Parte elegida la Sala de grupo. Se quitó la tarjeta "Próximamente".
- **La barra de arriba dice qué sala es** ("Biblioteca 6BXXFQ"). Con menos de 1120 píxeles de ancho queda solo el código, para no juntarse con el reloj.
- **Todo es de bloques, provisorio.** Cada adorno está en una lista con su tipo y su lugar, así que se puede cambiar por su arte sin tocar el resto.
- **La cámara se adapta a cada sala:** la vista de arriba se aleja o se acerca según el tamaño, y ninguna cámara pasa más allá de las paredes.

## Alternativas descartadas

- **Una sola sala que se achica según cuántos son:** las salas pueden crecer mientras se usan, y cada una pierde su carácter.
- **Elegir el número de personas aparte del ambiente:** son más combinaciones que diseñar, y no se pidió.
- **Luces reales en cada lámpara:** cuestan mucho al dibujar. Las lámparas y las ventanas brillan solas, sin iluminar lo demás.

## Consecuencias

- **`client/src/roomLayout.ts`** describe cada sala: medidas, colores, mesas y decoración. Sigue sin Three.js, porque lo usan el plano del menú y la portada.
- **`client/src/roomDecor.ts`** arma cada adorno con bloques. Los materiales se comparten por color, para gastar menos memoria de video.
- **`room.ts` ya no arma la sala al cargarse:** `buildRoom(kind)` la arma al entrar, y llena la lista de sillas.
- **Al unirse con un código, el servidor responde el tipo de sala** (`room:join` devuelve `{ kind, timer }`), porque sin él la página no sabe qué sala armar.
- **Quienes ya estaban en la sala llegan antes de que se arme:** apenas se arma, cada uno se sienta en su silla (`reseatRemotePlayers`). Antes de este arreglo aparecían en el centro de la sala.
- **El servidor sabe cuántas sillas tiene cada tipo** (`ROOM_SEATS`), y no acepta una silla que no existe en esa sala.
