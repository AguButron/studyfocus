# Propuesta de arte: Estudio de a dos en cubos

Prueba de estilo aparte de la app, para decidir cómo se verán las salas cuando tengan su arte. No forma parte de la aplicación.

Abre `index.html` en un navegador. No hay que instalar nada, pero necesita internet para descargar Three.js. Si el navegador no carga el archivo abierto directo, sírvelo con `python -m http.server` desde `prototipos/` y entra a `http://localhost:8000/sala-dos-voxel/`.

## La idea

- **Todo es de cubos de 10 cm,** como pixel art en 3D: el piso de tablas, las paredes con zócalo, la ventana con un atardecer, la alfombra con un rombo, los muebles, las plantas y las personas.
- **Cada cubo varía un poco de tono,** para que se vea dibujado a mano y no plano.
- **"Píxeles grandes"** dibuja a la mitad de resolución y agranda sin suavizar, como un juego de pixel art. Se puede apagar para comparar.
- **De tarde o de noche:** la luz entra por la ventana y las lámparas ponen la luz cálida. De noche mandan las lámparas y la pantalla del computador.
- **Es la misma distribución de la sala "duo"** (`client/src/roomLayout.ts`): la mesa al centro, la ventana atrás, la lámpara de pie, el sillón, el mueble con planta, el afiche y la planta alta. Suma una repisa con libros, una lámpara de mesa, tazas y una planta en el alféizar.
- **Arriba está la barra de la sala tal como está hoy,** para ver cómo se vería la página completa.

## Cifras

Unos 16.000 cubos, dibujados en dos llamadas (InstancedMesh), con sombras de la luz de la ventana.

## Antes de llevarlo a la app

- Dibujar los adornos en MagicaVoxel y cargarlos como modelos, en vez de armarlos con coordenadas en el código.
- Juntar las caras de los cubos vecinos (greedy meshing) para bajar los triángulos.
- Medir el rendimiento en un portátil común y en un celular, pensando en la app nativa.
- Los personajes deberían usar el mismo estilo del prototipo de avatar (`prototipos/avatar-voxel`).
