# 0026: Ahorrar memoria: YouTube con portada y la sala 3D solo dentro de la sala

**Estado:** aceptada.

**Fecha:** 2026-11-10

## Contexto

Después de llevar la música al menú ([0024](0024-musica-en-todo-momento.md)), la pestaña pasó de unos 80 MB a 300–400 MB. Se midió con una compilación de producción en una pantalla de 1920 × 1080:

- El JavaScript de la página ocupaba solo 6–8 MB y no crecía: no había fugas.
- El **reproductor de YouTube** se cargaba en el menú apenas se abría la página, aunque estuviera en pausa. Corre en un proceso aparte y suele usar 150–250 MB.
- La **escena 3D** creaba su lienzo WebGL (1920 × 1080, con suavizado, unos 80 MB de memoria de video; unos 300 MB en pantallas de alta densidad) **al cargar la página**, aunque nunca se entrara a una sala. El dibujo de las mesas del menú importaba `room.ts` solo para saber dónde van las sillas, y `room.ts` importaba la escena. Tras salir de una sala, además, el lienzo quedaba reservado.
- Todo el código iba en un solo archivo de 725 KB, la mayor parte Three.js.

## Decisión

1. **YouTube con portada.** Mientras no tiene que sonar (al abrir la página), se muestra la miniatura del video con un botón ▶. El reproductor recién se carga al apretarlo, y suena al tiro. Al poner un link o elegir YouTube, suena de inmediato como antes.
2. **La escena 3D solo dentro de la sala.** El lienzo WebGL se crea al entrar a una sala (`startRenderer`) y se libera al volver al menú (`stopRenderer`, que llama a `dispose` y `forceContextLoss`). Como entrar a una segunda sala ya recarga la página, no hace falta volver a armarla.
3. **Densidad máxima de 1,5×** en la escena. En pantallas de alta densidad baja casi a la mitad la memoria de video, y en una sala de bloques lisos casi no se nota.
4. **Three.js en un archivo aparte.** El menú carga 173 KB (53 KB comprimido) en vez de 725 KB. La sala (`roomScene.ts`) y el modelo 3D (`characterModel.ts`) se descargan al entrar a una sala. La sala se descarga **antes** de unirse, porque el servidor manda quiénes están adentro justo al entrar, y quien los dibuja tiene que estar escuchando.
   - **Las posiciones de mesas y sillas** pasaron a `roomLayout.ts`, sin Three.js.
   - **La actividad y la cámara elegidas** pasaron a `choices.ts`, sin Three.js, así que el temporizador y estudiar solo no cargan la escena.
   - **Las fotos de los personajes** se sacan una vez en el estudio 3D y se guardan en el navegador (`studyfocus.photos.v1`, unos 4 KB cada una). Desde la segunda visita, el menú no descarga Three.js. Mientras una foto se saca, se ve un cuadrado del color del personaje. El estudio de fotos se cierra a los 2 segundos sin uso.

## Consecuencias

- Al abrir la página con YouTube elegido, hay que apretar ▶ (antes también, porque el video partía en pausa).
- Entrar a la primera sala puede tardar un instante más: se descarga la sala y se crea el lienzo.
- La primera visita en un navegador descarga Three.js para sacar las fotos; las siguientes no.
- Si cambia cómo se ve la foto del personaje, hay que cambiar la versión de la clave `studyfocus.photos.v1` para volver a sacarlas.
- **Cuadros negros con YouTube (2026-11-10):** en Chrome con Windows, el video de YouTube sobre el lienzo 3D dejaba rectángulos negros, sobre todo al sacar el mouse del video (cuando YouTube esconde sus controles). Desaparecían al quitar la música. Al reproductor se le dio una capa propia (`transform: translateZ(0)`), para que el video se dibuje dentro de la página y no en una capa aparte de la tarjeta gráfica. No se pudo reproducir en el navegador de pruebas: falta confirmarlo en el equipo donde pasaba.
