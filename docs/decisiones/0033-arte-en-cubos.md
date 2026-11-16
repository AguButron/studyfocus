# 0033: El arte de las salas, en cubos

**Estado:** aceptada para el Estudio individual, el Estudio de a dos y la Sala de grupo: quien crea la sala elige su diseño y lo ven todos. Faltan el Café, la Biblioteca y el Salón de estudio.

**Fecha:** 2026-11-14

## Contexto

Las salas se ven con bloques grandes y lisos ([0031](0031-tipos-de-sala.md)). Se pidió que el arte sea en cubos, como pixel art en 3D, con varios diseños por cada tipo de sala para elegir, y un modo para armar una sala propia con muebles ya hechos. Sin personajes: solo la escenografía. La primera prueba fue [`prototipos/sala-dos-voxel`](../../prototipos/sala-dos-voxel/README.md).

## Decisión

### Un kit de cubos, listo para la app

Está en `client/src/voxel/`, escrito para usarse en la sala real y no solo en una prueba:

| Archivo | Qué hace | ¿Usa Three.js? |
|---|---|---|
| `voxels.ts` | El conjunto de cubos de 2,5 cm: poner, llenar, girar, juntar, y sacar las caras que se ven juntando las vecinas del mismo color (`faceQuads`) | No |
| `props.ts` | El catálogo: 45 muebles y adornos, cada uno con sus colores y opciones que se pueden cambiar, y algunos con su propia luz | No |
| `roomBuilder.ts` | Arma una sala completa: el piso (5 estilos), las paredes (5 estilos), las mesas y sillas de su tipo y los muebles del diseño | No |
| `designs.ts` | Los 9 diseños: tres por cada sala de 1, 2 y 4 personas | No |
| `voxelView.ts` | Dibuja con Three.js: toda la sala en dos figuras con solo las caras que se ven (`voxelMesh`), con sombras, la luz según la hora y las lámparas | Sí |

- **Cubos de 2,5 cm:** las posiciones van en cubos enteros; un metro son 40 cubos (`PER_METER`), así que las mesas y sillas de `roomLayout.ts` quedan en su lugar × 40. Las paredes miden 100 cubos (2,5 m) y lo que va sobre una mesa parte en y = 32 (80 cm, `ON_TABLE`).
- **Los muebles varían un poco de tono por bloques de 5 cm** (2 × 2 × 2 cubos), para que se vean dibujados a mano sin que cada cubo sea una cara aparte al dibujar. En el piso y las paredes, el tono cambia por tabla, baldosa, piedra o ladrillo.
- **"Píxeles grandes":** se dibuja a tres cuartos de la resolución y se agranda sin suavizar. Antes era la mitad; con cubos de 2,5 cm, a la mitad los cubos quedaban más chicos que un píxel.
- **Los diseños no cambian las mesas ni las sillas:** salen de `roomLayout.ts`, así que los números de silla son los mismos, cualquiera sea el diseño. Cambian el piso, las paredes, la hora, los colores de las mesas y sillas y los adornos.
- **Solo se dibujan las caras que se ven, y juntas:** las caras vecinas del mismo color y brillo se dibujan como una sola (greedy meshing). Las caras de abajo del piso no se dibujan, porque la cámara nunca mira desde abajo.

### Cubos de 5 cm, con el doble de detalle

Los muebles se rehicieron con el doble de resolución, no solo partidos en cubos más chicos: libros finos con el lomo marcado y las hojas a la vista, plantas con hojas sueltas que caen en la punta, patas, bordes y marcos más delgados, cojines redondeados y capitoneados, molduras en los estantes, ventanas y pizarras, y la barra de café con cafetera (grupos, manómetro, lanza de vapor), molinillo, tazas, una vitrina abierta con torta y un frasco de galletas. Los nombres, colores y opciones de cada mueble son los mismos. Las salas guardadas en Crea tu sala con cubos de 10 cm se pasan solas a 5 cm al abrirlas.

Medido con `npx tsx` (en Node, sin dibujar): antes, cubos de 10 cm con InstancedMesh (12 triángulos por cubo visible); después, cubos de 5 cm. "Caras sueltas" son los triángulos si cada cara visible se dibujara sola; "caras juntas", los que se dibujan de verdad. El tiempo es armar la sala más juntar las caras.

| Diseño | Cubos antes | Triángulos antes | ms antes | Cubos después | Caras sueltas | Caras juntas | ms después |
|---|---|---|---|---|---|---|---|
| `solo-noche` | 9.855 | 109.668 | 18 | 41.990 | 92.216 | 23.478 | 67 |
| `solo-luz` | 9.347 | 103.608 | 14 | 39.463 | 90.392 | 17.154 | 53 |
| `solo-atico` | 10.214 | 108.876 | 13 | 45.117 | 90.636 | 20.504 | 80 |
| `duo-ventana` | 16.050 | 178.608 | 19 | 68.841 | 153.120 | 25.404 | 113 |
| `duo-cafe` | 14.484 | 167.748 | 19 | 58.585 | 148.248 | 29.742 | 95 |
| `duo-noche` | 15.260 | 168.324 | 19 | 64.194 | 155.076 | 37.544 | 99 |
| `group-proyectos` | 19.238 | 215.676 | 24 | 79.070 | 190.152 | 27.688 | 101 |
| `group-lectura` | 21.082 | 225.216 | 25 | 91.146 | 207.764 | 51.564 | 141 |
| `group-terraza` | 18.179 | 207.396 | 24 | 75.110 | 193.872 | 40.474 | 109 |
| `cafe-clasico` | 33.541 | 331.944 | 44 | 154.767 | 316.280 | 85.046 | 244 |
| `cafe-nordico` | 29.889 | 307.248 | 39 | 135.807 | 296.224 | 46.582 | 197 |
| `cafe-nocturno` | 30.150 | 310.788 | 39 | 136.133 | 303.100 | 68.986 | 211 |
| `library-clasica` | 44.459 | 439.128 | 62 | 198.192 | 450.488 | 141.724 | 361 |
| `library-moderna` | 37.565 | 410.592 | 50 | 164.061 | 424.256 | 105.628 | 260 |
| `library-archivo` | 41.813 | 419.232 | 65 | 183.793 | 434.616 | 126.254 | 337 |
| `study-clases` | 43.102 | 477.384 | 57 | 178.776 | 474.128 | 78.490 | 275 |
| `study-cowork` | 42.703 | 473.868 | 61 | 184.630 | 487.036 | 113.928 | 323 |
| `study-invernadero` | 44.528 | 491.868 | 60 | 186.957 | 494.624 | 98.146 | 293 |

- **Se dibujan menos triángulos que antes,** aunque hay cuatro veces más cubos: la sala más pesada (Biblioteca clásica) quedó en 142.000, contra 491.000 de la más pesada de antes. Ninguna se acerca al límite que se había puesto (400.000).
- **Armar la sala tarda más:** hasta ~360 ms en Node y 289 ms en el navegador (Invernadero). Pasa una vez, al entrar.

### Cubos de 2,5 cm, solo en las salas de 1, 2 y 4 personas

**Fecha:** 2026-11-15

Se pidió achicar los cubos otra vez y rehacer los muebles con más detalle, pero solo en el Estudio individual, el Estudio de a dos y la Sala de grupo. Las otras tres (Café, Biblioteca y Salón de estudio) salen como **"Próximamente"** en la galería; sus diseños se sacaron de `designs.ts` (están en el historial de git) y se rehacen después.

- **Los muebles se dibujaron de nuevo,** no solo partidos: patas, marcos, ribetes y uniones de 2,5 cm, libros de 5 a 10 cm con dos franjas y etiqueta, hojas más chicas con nervadura, el reloj con sus doce marcas, la ventana con la ciudad y el cielo al doble de detalle, y el piso y las paredes con uniones más finas (las baldosas ahora tienen fragüe y el arrimadero, paneles en relieve).
- **Tres muebles siguen en cubos de 5 cm:** el sofá, la mesa de centro y la barra de café (`legacy` en `props.ts`). No están en estas salas; se agrandan al doble al ponerlos en Crea tu sala.
- **La mesa de a dos es más grande:** 1,6 × 1,3 m (antes 1,2 × 1,2). Encima tiene, en sus tres diseños, una **lata energética blanca** frente a un asiento y una **taza de café** frente al otro (`energyCan` y `coffee`). El **cuaderno abierto** (`notebook`) se probó en la mesa y se sacó, pero queda en el catálogo de Crea tu sala. La lámpara o las velas pasaron al lado de atrás de la mesa.
- **Nada se monta sobre la ventana:** el diario mural de "Estudio luminoso" pasó a la pared izquierda, y la guirnalda de "Ático de madera" y de "Noche de estudio", a una pared de los lados.
- **Las paredes ahora miden 5 cm de grueso** (2 cubos), no 10: el resto eran cubos que no se ven.
- **Crea tu sala:** las salas guardadas con cubos de 10 o 5 cm se pasan solas a 2,5 cm al abrirlas. Las flechas siguen moviendo de a 10 cm (con Shift, de a 50 cm).

**Para que no se pusiera lento** (con cubos de la mitad, una sala tiene ocho veces más):

- Cada cubo se guarda como un número (`keyOf` en `voxels.ts`) en vez de un texto `"x,y,z"` con un objeto: se arma más rápido y usa mucha menos memoria.
- El tono de los muebles varía por bloques de 5 cm y no por cubo, así las caras vecinas del mismo tono se siguen juntando al dibujar.
- La figura se arma con arreglos del tamaño justo (`Float32Array`) en vez de listas que crecen.

Medido con `npx tsx` (en Node, sin dibujar). "Triángulos" son los que se dibujan de verdad; el tiempo es armar la sala más juntar las caras.

| Diseño | Cubos de 5 cm | Triángulos 5 cm | ms 5 cm | Cubos de 2,5 cm | Triángulos 2,5 cm | ms 2,5 cm |
|---|---|---|---|---|---|---|
| `solo-noche` | 41.990 | 23.478 | 67 | 193.639 | 39.670 | 159 |
| `solo-luz` | 39.463 | 17.154 | 53 | 177.829 | 33.024 | 112 |
| `solo-atico` | 45.117 | 20.504 | 80 | 220.026 | 27.502 | 168 |
| `duo-ventana` | 68.841 | 25.404 | 113 | 321.767 | 45.080 | 209 |
| `duo-cafe` | 58.585 | 29.742 | 95 | 252.709 | 51.376 | 219 |
| `duo-noche` | 64.194 | 37.544 | 99 | 300.129 | 71.798 | 181 |
| `group-proyectos` | 79.070 | 27.688 | 101 | 352.531 | 41.908 | 199 |
| `group-lectura` | 91.146 | 51.564 | 141 | 456.491 | 69.374 | 334 |
| `group-terraza` | 75.110 | 40.474 | 109 | 330.172 | 80.836 | 240 |

- **Se dibujan menos de 81.000 triángulos** en la sala más pesada, lejos del límite de 400.000.
- **Armar la sala tarda el doble que con 5 cm** (hasta ~330 ms en Node; en el navegador, ~150 ms en el Estudio de a dos). Pasa una vez, al entrar.

### Las cosas de estudio en cubos, con variantes

**Fecha:** 2026-11-15

El computador, el cuaderno y el libro que cada persona tiene frente a ella al estudiar (`activity.ts`) se rehicieron en cubos de 2,5 cm, con variantes que se eligen en el panel del temporizador, bajo "¿Qué estás haciendo?":

| Actividad | Variantes |
|---|---|
| Computador | Portátil gris (editor de código) · Portátil plateado (documento) · Portátil con stickers (planilla) · Computador de escritorio (navegador, con teclado y mouse) |
| Leyendo | Libro de estudio (tapa dura, con un gráfico) · Novela de bolsillo · Atlas ilustrado (con un mapa) |
| Escribiendo | Cuaderno universitario (renglones y margen) · Libreta cuadriculada · Hojas y destacador |

- **El dibujo está en `voxel/studyItems.ts`** (sin Three.js) y se arma en `voxel/studyItemMesh.ts`. Lo escrito (la pantalla, el texto, la tinta) son píxeles planos de medio cubo (1,25 cm), así la letra es más fina que los cubos.
- **Se sigue animando igual que antes:** el texto de la pantalla aparece de a poco, la mano sigue a la tinta al escribir y la hoja del libro da vuelta. Lo escrito se muestra dibujando solo los primeros píxeles (`setDrawRange`), sin crear figuras nuevas en cada cuadro.
- **Las demás personas ven tu variante:** la página la manda en su estado (`item`, de 0 a 3) y el servidor la valida. No se guarda en `active_sessions`: si el servidor se reinicia, vuelve a la primera hasta el próximo estado.
- **La galería** (`salas.html`) pone una cosa distinta frente a cada asiento ("Cosas de estudio"; "Cambiar" las rota), para ver todas las variantes en cada mesa.

**Frente a cada asiento queda libre el espacio para estudiar:** 35 cm a cada lado de la persona, desde 35 cm más allá del objeto hasta el borde de la mesa. Las lámparas, velas, libros, la lata y el café de los diseños se movieron a los costados de las mesas (o a la franja del medio en la Sala de grupo), y se revisó con un script que ninguno caiga en esa zona. El pie del computador de escritorio no pasa del centro de la mesa, para no chocar con el de quien se sienta enfrente.

### 13 muebles nuevos, repartidos en los 9 diseños

**Fecha:** 2026-11-16

Se probó rehacer los tres diseños de la Sala de grupo y se descartó: se veían parecidos a los de antes y costaban más. Se quedaron los muebles nuevos, se hicieron más y se repartieron entre los 9 diseños, sin cambiar sus nombres, pisos, paredes ni horas.

| Mueble | Categoría | Dónde está |
|---|---|---|
| Chimenea (con fuego y luz propia, un cuadro y el tiro hasta el techo) | Muebles | Club de lectura |
| Globo terráqueo | Muebles | Junto a la ventana, Club de lectura |
| Dispensador de agua | Muebles | Sala de proyectos |
| Guitarra | Muebles | Rincón de noche, Ático de madera, Noche de estudio |
| Perchero (con gorro, chaqueta y bufanda) | Muebles | Café de esquina |
| Radio antigua (dial encendido) | Muebles | Café de esquina, sobre la banca |
| Gato durmiendo en su cojín | Muebles | Rincón de noche, Estudio luminoso, Junto a la ventana, Noche de estudio, Club de lectura |
| Tablero de tareas (por hacer, haciendo, listo) | Pared | Sala de proyectos |
| Pantalla con una presentación | Pared | Sala de proyectos |
| Calendario | Pared | Rincón de noche, Estudio luminoso, Junto a la ventana, Noche de estudio |
| Enrejado con enredadera | Pared | Terraza cubierta (dos) |
| Farol (con luz propia) | Luces | Ático de madera, Terraza cubierta (dos) |
| Jardinera con flores | Plantas | Terraza cubierta (dos, bajo los enrejados) |

- **Café de esquina:** la mesa ya no es redonda: es la mesa de a dos cuadrada, en su tamaño grande (1,8 × 1,4 m, la opción "Tamaño" de `table2`), y en vez de las velas tiene una lámpara de banquero roja. Los otros dos diseños de a dos siguen con la de 1,6 × 1,3 m.
- **Están en el catálogo de Crea tu sala,** con sus colores para cambiar, como los demás.
- **Pintados para que sus caras se junten:** cada piedra, tabla o franja tiene un solo tono (sin la variación por bloques), así el dibujo junta las caras vecinas.
- **Nada choca:** un script revisó que ningún cubo de los muebles nuevos caiga sobre otro mueble, y ninguno va sobre las mesas, así queda libre el espacio de estudio.

Medido con `npx tsx` (en Node, sin dibujar):

| Diseño | Triángulos antes | Triángulos ahora | ms ahora |
|---|---|---|---|
| `solo-noche` | 39.670 | 41.298 | 180 |
| `solo-luz` | 33.024 | 34.642 | 98 |
| `solo-atico` | 27.502 | 28.130 | 139 |
| `duo-ventana` | 45.080 | 47.770 | 198 |
| `duo-cafe` | 51.376 | 53.220 | 166 |
| `duo-noche` | 71.798 | 72.928 | 159 |
| `group-proyectos` | 41.908 | 43.606 | 168 |
| `group-lectura` | 69.374 | 74.840 | 340 |
| `group-terraza` | 80.836 | 94.666 | 225 |

La más pesada (Terraza cubierta) queda en ~95.000 triángulos, lejos del límite de 400.000.

### Los 9 diseños

| Sala | Diseños |
|---|---|
| Estudio individual | Rincón de noche · Estudio luminoso · Ático de madera |
| Estudio de a dos | Junto a la ventana · Café de esquina · Noche de estudio |
| Sala de grupo | Sala de proyectos · Club de lectura · Terraza cubierta |
| Café, Biblioteca, Salón de estudio | Próximamente |

### Dos páginas para verlo (solo mientras se desarrolla)

Con `iniciar.cmd` (o `npm run dev` en `client`):

- **`http://localhost:5173/salas.html`:** la galería. Se elige el tipo de sala, se recorren sus tres diseños, se mira desde arriba, de lado o de cerca, y "Elegir este diseño" lo guarda en el navegador (`studyfocus.roomDesigns`).
- **`http://localhost:5173/crea-tu-sala.html`:** **Crea tu sala.** Se elige el tamaño (chica, mediana o grande), la hora, el estilo y los colores del piso y las paredes. Después se ponen muebles del catálogo con un clic en el piso: lo que cuelga se pega solo a la pared más cercana. Un mueble se puede mover, girar (R), duplicar, borrar (Supr), subir o bajar (Re Pág / Av Pág), correr con las flechas y cambiarle los colores y opciones. Las mesas tienen "Agregar sillas alrededor", y cada silla cuenta como un asiento. Se guarda solo en el navegador (`studyfocus.customRoom`), con Deshacer (Ctrl+Z).

Ninguna de las dos se publica: `vite build` solo arma `index.html`.

### En la sala de verdad

**Fecha:** 2026-11-15

- **Se elige al crear la sala:** en Estudiar, al elegir el Estudio de a dos o la Sala de grupo aparece a la derecha una tarjeta con la barra de sus tres diseños arriba y, debajo, la vista previa de la sala en cubos, quieta, con su nombre, su descripción y el botón para crearla (`voxel/roomPreview.ts`, que se descarga recién al abrir Estudiar). Las salas sin diseños en la app muestran su plano. Se recuerda el último por tipo (`studyfocus.roomDesigns`, la misma llave que "Elegir este diseño" en `salas.html`).
- **El servidor lo guarda con la sala:** `room:create` recibe `{ kind, design }` (las páginas de antes mandan solo el tipo), revisa que el diseño sea de ese tipo (`ROOM_DESIGNS` en `server/src/index.ts`, la misma lista de `designs.ts`) y lo guarda en la columna `design` de `rooms`, así sigue tras un reinicio. Al unirse o volver a una sala, la respuesta trae `design` junto a `kind`.
- **`room.ts` arma la sala con el diseño de la sala** (`getRoomDesign` en `network.ts`), el mismo para todos. Las salas sin diseño guardado usan el primero de su tipo. Los tipos sin diseños (Café, Biblioteca, Salón de estudio) siguen con la sala de siempre.
- **El Estudio individual (2026-11-16):** tu escritorio (`deskScene.ts`) es ahora la pieza en cubos del diseño que elegiste en Estudiar, con su propia vista previa. Es la misma pieza de la sala "solo", movida para que su silla quede donde se sienta el personaje, y baja 5 cm como las otras salas. La pared de la ventana (con lo que cuelga de ella) va aparte, para esconderla en la vista de frente, que mira desde afuera. Las cámaras se ajustaron a la pieza: la de frente sube para mirar por encima de lo que hay en el escritorio, y las otras no pasan por detrás de las paredes. La luz sale del diseño: el cielo según la hora, el sol por la ventana y hasta 4 lámparas. Solo lo ves tú, así que el diseño no se guarda en el servidor: se lee de este navegador (`getChosenDesign` en `choices.ts`).
- Probado con @prueba.ana, que creó un Estudio de a dos con "Noche de estudio", y @prueba.benja por script: al unirse recibió `{"kind":"duo","design":"duo-noche"}`.

- Las sillas de cubos se ven siempre. Para elegir asiento, cada silla libre se envuelve en una caja verde transparente, más fuerte bajo el mouse. Es la misma caja que recibe el clic.
- Toda la sala de cubos baja 5 cm (`VOXEL_SINK`). Así la cubierta de las mesas queda a 0,75 m y el computador, el libro y el cuaderno quedan apoyados, sin tocar `activity.ts`.
- Se prenden hasta 4 lámparas del diseño. La pared alta de adelante (para la vista sentada) es una caja lisa del color de las paredes.
- Probado en la Sala de grupo con "Club de lectura": elegir asiento, sentarse, iniciar el temporizador y la vista Escritorio.

## Cómo llevarlo a la sala de verdad

1. ~~Elegir el diseño al crear una sala~~ y ~~que `room.ts` use el de la sala~~: hecho (ver "En la sala de verdad").
2. ~~El Estudio individual con su diseño~~: hecho.
3. **La pared alta de adelante en cubos,** en vez de la caja lisa.
4. ~~Las salas de antes usan el primero de su tipo~~: hecho.
5. **Crea tu sala, en la cuenta:** guardar el diseño propio en la base (por ejemplo, `custom_rooms` con el JSON) y permitir abrirlo como sala. Sus sillas son los asientos, así que el cupo es la cantidad de sillas.
6. **Antes de publicar:** medir el rendimiento en un portátil común y en un celular (pensando en la [app nativa](0032-app-nativa.md)). Armar la Sala de grupo tarda hasta ~330 ms: si molesta, se puede armar en un worker.
7. **Rehacer en 2,5 cm el Café, la Biblioteca y el Salón de estudio,** con el sofá, la mesa de centro y la barra de café.

## Alternativas descartadas

- **Modelos hechos a mano en MagicaVoxel desde ya:** se ven mejor, pero cada cambio pasa por otro programa. Con el kit en código se pudo probar 18 diseños en una noche. Más adelante, los muebles importantes se pueden dibujar en MagicaVoxel y cargar con el mismo catálogo.
- **Un diseño por tipo de sala:** se pidió poder elegir entre varios.
- **Que Crea tu sala cambie las mesas de una sala existente:** los asientos dejarían de calzar con los que ya están ocupados. Por eso una sala propia es un diseño aparte, con su propio cupo.
