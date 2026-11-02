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

## Fase 2: Multijugador (completada)

Un servidor con Socket.IO. Dos pestañas se ven moverse en tiempo real.

- [x] Dividir `main.ts` en varios archivos, sin cambiar el comportamiento
- [x] Crear el servidor en `server/` y arrancarlo
- [x] Conectar el cliente al servidor y ver cada conexión en sus registros
- [x] Enviar la posición del jugador y reenviarla a los demás
- [x] Dibujar a los otros jugadores y quitarlos cuando se desconectan
- [x] Suavizar el movimiento de los otros jugadores

**Terminada cuando:** con dos pestañas abiertas, cada una ve moverse a la otra con suavidad, y al cerrar una, su personaje desaparece de la otra.

## Fase 3: Salas (completada)

Crear una sala y unirse con un código o link, usando un apodo. Las salas viven en la memoria del servidor: se borran al quedar vacías o al reiniciarlo. Guardarlas es parte de la fase 6.

- [x] Separar a los jugadores por sala en el servidor, con códigos de sala
- [x] Mostrar una pantalla inicial para escribir el apodo y crear o unirse a una sala
- [x] Validar en el servidor el apodo, el código y las posiciones recibidas
- [x] Copiar un link de invitación y entrar directo a la sala desde él
- [x] Mostrar el apodo sobre cada personaje

**Terminada cuando:** dos grupos en salas distintas no se ven entre sí, y un amigo puede entrar a mi sala abriendo el link que le paso.

## Fase 4: Estudiar (actual)

Sentarse en una mesa y usar un temporizador Pomodoro individual. Es el centro del producto: una vez sentado, la pantalla debe ayudar a concentrarse y no invitar a seguir caminando. También debe gastar poca batería: la escena se redibuja muy poco mientras se estudia, y nada con la pestaña oculta.

Cada persona tiene su propio temporizador y estudia a su ritmo: elige los minutos de estudio y de descanso, a partir del clásico 25-5, y puede pausarlo. Ver la [decisión](decisiones/0002-pomodoro-individual.md).

- [x] Agregar sillas y sentarse o levantarse con una tecla
- [x] Mostrar a los demás quién está sentado y dónde, sin que dos ocupen la misma silla
- [x] Crear el temporizador en el navegador, con estudio, descanso y pausa
- [x] Mostrar el temporizador y sus controles al estar sentado
- [x] Elegir con una barra los minutos de estudio y descanso, y recordarlos para la próxima vez
- [x] Conservar el temporizador al recargar la página
- [x] [Pasar a primera persona al sentarse](decisiones/0003-primera-persona-al-estudiar.md), con el temporizador como elemento principal
- [x] Elegir qué se está haciendo: computador, lectura o escritura
- [x] Rediseñar la pantalla inicial, la sala y la sesión de estudio
- [ ] Mostrar a los demás en qué periodo está cada persona
- [ ] Avisar con un sonido el cambio entre estudio y descanso
- [ ] Reducir el redibujado al estar sentado y detenerlo con la pestaña oculta

**Terminada cuando:** dos amigos se sientan en la misma mesa, cada uno usa su temporizador con sus propios minutos, puede pausarlo, no lo pierde al recargar, ve en qué periodo está el otro, y el consumo baja mientras estudian.

## Fase 5: Publicar

La página en internet, con CI y amigos probándola. **Al terminar esta fase, el MVP está completo.**

## Fase 6: Crecer

Cuentas, salas guardadas y estadísticas; animaciones del personaje según su periodo de estudio o descanso; luego, chat de voz.

## Cómo trabajamos cada tarea

1. **Definir:** una tarea pequeña que diga cuándo se considera terminada.
2. **Implementar:** primero el concepto, luego el código.
3. **Probar:** comprobar que funciona y que `npm run build` compila.
4. **Subir:** hacer commit y push directo a `main`.

Trabajamos sin ramas ni pull requests porque hay una sola persona en el proyecto. Si se suma alguien más, conviene retomarlos.
