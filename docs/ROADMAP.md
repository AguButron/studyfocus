# Hoja de ruta

Marca cada tarea con `[x]` al terminarla. Las fases 2 a 6 se dividirán en tareas cuando estemos por empezarlas, porque lo que aprendamos antes puede cambiarlas.

## Fase 0: Organización (completada)

- [x] Inicializar el repositorio
- [x] Escribir el README y esta hoja de ruta
- [x] Hacer el primer commit
- [x] Crear el repositorio remoto y subir el código

**Terminada cuando:** el código está en GitHub.

## Fase 1: Un jugador (completada)

El objetivo es llegar a una mesa, no entretener: movimiento simple y sin mecánicas de juego.

- [x] Crear el proyecto con Vite y TypeScript
- [x] Mostrar Phaser con una escena vacía en el navegador
- [x] Dibujar el personaje y moverlo con el teclado
- [x] Decidir el paso a 3D y [registrar el motivo](decisiones/0001-usar-threejs.md)
- [x] Cambiar Phaser por Three.js y mostrar un cubo con cámara y luz
- [x] Mover el cubo sobre un suelo con el teclado
- [x] Construir la sala con paredes y mesas
- [x] Hacer que las paredes y mesas bloqueen el paso

**Terminada cuando:** puedo caminar por la sala sin atravesar paredes ni mesas.

## Fase 2: Multijugador (actual)

Un servidor con Socket.IO. Dos pestañas se ven moverse en tiempo real.

- [x] Dividir `main.ts` en varios archivos, sin cambiar el comportamiento
- [x] Crear el servidor en `server/` y arrancarlo
- [x] Conectar el cliente al servidor y ver cada conexión en sus registros
- [ ] Enviar la posición del jugador y reenviarla a los demás
- [ ] Dibujar a los otros jugadores y quitarlos cuando se desconectan
- [ ] Suavizar el movimiento de los otros jugadores

**Terminada cuando:** con dos pestañas abiertas, cada una ve moverse a la otra con suavidad, y al cerrar una, su personaje desaparece de la otra.

## Fase 3: Salas

Crear una sala y unirse con un código o link, usando un apodo.

## Fase 4: Estudiar

Sentarse en una mesa y usar un temporizador Pomodoro compartido. Es el centro del producto: una vez sentado, la pantalla debe ayudar a concentrarse y no invitar a seguir caminando. También debe gastar poca batería: la escena se redibuja muy poco mientras se estudia, y nada con la pestaña oculta.

## Fase 5: Publicar

La página en internet, con CI y amigos probándola. **Al terminar esta fase, el MVP está completo.**

## Fase 6: Crecer

Cuentas, salas guardadas y estadísticas; luego, chat de voz.

## Cómo trabajamos cada tarea

1. **Definir:** una tarea pequeña que diga cuándo se considera terminada.
2. **Implementar:** primero el concepto, luego el código.
3. **Probar:** comprobar que funciona y que `npm run build` compila.
4. **Subir:** hacer commit y push directo a `main`.

Trabajamos sin ramas ni pull requests porque hay una sola persona en el proyecto. Si se suma alguien más, conviene retomarlos.
