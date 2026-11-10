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

## Fase 4: Estudiar (completada)

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
- [x] Bloquear la tecla E durante el estudio
- [x] [Ver al personaje desde atrás al elegir los minutos](decisiones/0004-camaras-al-estudiar.md)
- [x] Cambiar entre las cámaras Escritorio, Mesa y Sala al comenzar el temporizador
- [x] Al comenzar, achicar el temporizador arriba a la izquierda y dejar las cámaras arriba a la derecha
- [x] Hacer que las sillas bloqueen el paso
- [x] [Mostrar a los demás qué está haciendo cada persona, con sus manos en movimiento](decisiones/0005-compartir-actividad-ahora.md)
- [x] Mostrar a los demás en qué periodo está cada persona
- [x] Ver los datos de otra persona al hacer clic en ella, con un zoom de la cámara
- [x] Subir la cámara Escritorio, para ver lo que tiene quien está al frente
- [x] Cambiar Reiniciar por Abandonar, con confirmación, para terminar la sesión
- [x] [Seguir en la misma silla y con el mismo temporizador al recargar la página](decisiones/0006-volver-al-recargar.md)
- [x] Avisar con un sonido el cambio entre estudio y descanso
- [x] Reducir el redibujado al estar sentado y detenerlo con la pestaña oculta

**Terminada cuando:** dos amigos se sientan en la misma mesa, cada uno usa su temporizador con sus propios minutos, puede pausarlo, no lo pierde al recargar, ve en qué periodo está el otro y qué está haciendo, y el consumo baja mientras estudian. El detalle de las tareas pendientes está en la [visión del proyecto](VISION.md#lo-siguiente).

## Fase 5: Publicar (completada)

La página en internet, con CI y amigos probándola. **Al terminar esta fase, el MVP está completo.**

- [x] [Entregar la página y el servidor desde un solo servicio](decisiones/0007-un-solo-servicio.md), con el puerto configurable
- [x] Compilar el cliente y revisar el servidor en CI, en cada push
- [x] Elegir el hosting (Render, plan gratis) y crear el servicio
- [x] Probar la página publicada con el HTTPS y los WebSocket reales
- [x] Probarla con amigos desde sus casas, incluidos cortes de conexión
- [x] Corregir lo que aparezca en esa prueba

**Terminada cuando:** un amigo abre el link desde su casa, se sienta en mi mesa y estudiamos juntos una sesión completa sin problemas.

## Fase 6: Crecer

Cuentas, salas guardadas, un menú principal y estadísticas. Para entrar a una sala hay que iniciar sesión, porque los amigos, las estadísticas y la tienda necesitan saber quién es cada persona. Ver la [decisión](decisiones/0009-cuenta-obligatoria-y-menu.md).

- [x] Conectar el servidor a una base de datos, con la dirección en una variable de entorno
- [x] [Crear una cuenta local o iniciar sesión con Google](decisiones/0008-cuentas.md)
- [x] Crear la base de datos en Neon y probar las cuentas locales contra ella
- [ ] Probar las cuentas en la página publicada
- [ ] Recuperar una contraseña olvidada y verificar el correo
- [x] Guardar las salas de quien tiene cuenta, para que su link siga sirviendo tras un reinicio
- [x] [Borrar las salas al quedar vacías](decisiones/0014-salas-vacias-se-borran.md), y quitar "Tus salas" del menú
- [x] [Exigir una cuenta y cambiar la pantalla inicial por un menú](decisiones/0009-cuenta-obligatoria-y-menu.md) con Salas, Amigos, Estadísticas, Tienda y Perfil
- [x] Elegir el tipo de sala al crearla, con un solo tipo por ahora
- [x] Volver al menú desde la sala con el botón Salir
- [x] [Agregar amigos con un código](decisiones/0010-amigos.md), y ver quién está estudiando y en qué sala
- [x] [Contar en el servidor el tiempo de estudio de cada cuenta](decisiones/0011-tiempo-de-estudio-en-el-servidor.md)
- [x] Mostrar las estadísticas de estudio y un resumen al salir de la sala
- [x] [Escuchar música propia en la sala](decisiones/0012-musica-personal.md): el lofi de StudyFocus o un video de YouTube
- [x] [Nombre de usuario fijo, apodo que cambia una vez al mes y perfil](decisiones/0013-usuario-apodo-y-perfil.md), visible en la tarjeta de cada persona
- [x] Agregar una portada que presenta la app, para quien no ha iniciado sesión
- [x] Volver a la misma silla y con el mismo periodo tras un reinicio del servidor
- [x] [Foto de perfil a partir del personaje](decisiones/0015-foto-desde-el-personaje.md), con un color a elegir por ahora
- [x] Dormir sobre la mesa durante el descanso, con los brazos cruzados y unas "z", visible para todos

**Terminada cuando:** inicio sesión desde otro dispositivo, vuelvo a mi sala con su mismo link y veo cuánto he estudiado, aunque el servidor se haya reiniciado.

El inicio de sesión con Google quedó pospuesto: el código está, pero el botón no aparece hasta definir `GOOGLE_CLIENT_ID`. Después viene el chat de voz. La tienda y los modelos de los personajes quedan para el final; ellos, la moneda y los espacios propios se describen en la [visión del proyecto](VISION.md).

## Fase 7: Plataforma de estudio (actual)

StudyFocus pasa de ser una sala para estudiar con amigos a ser la plataforma donde se organiza y se hace todo el estudio. Las salas con amigos siguen, como una de sus funciones. Ver la [decisión](decisiones/0016-plataforma-de-estudio.md).

- [x] Estudiar solo en una pantalla simple, sin 3D, con el temporizador y la música
- [ ] Estudiar solo en tu pieza: una sala 3D con una mesa y una silla, solo tuya
- [x] Mostrar a los amigos "Estudiando solo"
- [x] Inicio como menú principal con la sesión iniciada: hoy, racha, últimos 7 días y las opciones. El logo lleva a Inicio, y la portada queda solo para quien no ha entrado
- [x] Pestaña de amigos a la derecha del menú, con los conectados primero, y el perfil de cada amigo en una ventana, también desde Amigos
- [x] Achicar el panel de la izquierda a solo íconos
- [x] [Carpetas y apartados](decisiones/0018-espacios-y-apartados.md): semestres, proyectos y cursos, con sus ramos, partes o módulos; crear, editar, archivar y borrar
- [x] Elegir el apartado en el temporizador, también dentro de una sala
- [ ] Ver el apartado de cada persona en su tarjeta dentro de la sala
- [x] Horas por apartado en Estadísticas, y el avance hacia su meta semanal
- [x] [Agenda y calendario](decisiones/0017-agenda-y-calendario.md): pruebas, tareas, trabajos, presentaciones y recordatorios, con hora, notas y aviso; marcar como hecho; el calendario por semana, mes o año en su propia sección, e Inicio con lo de los próximos 7 días
- [x] Vincular la agenda a un apartado, con su color en el calendario
- [x] Notas con porcentaje, escala y exigencia por apartado, el promedio y la nota que falta para aprobar
- [ ] Completar Inicio: meta diaria
- [x] Reordenar el menú: Inicio, Calendario, Estudiar, Amigos, Estadísticas, Tienda, Carpetas y Perfil
- [x] Carpetas en tres pasos: la lista de carpetas, una carpeta con sus ramos, y el detalle de un ramo
- [x] [Leer los programas con IA](decisiones/0019-programas-con-ia.md): subir varios PDF, revisar lo que sacó y crear los ramos con sus evaluaciones, fechas, porcentajes y requisitos
- [x] Evaluaciones sin fecha, que quedan en su ramo fuera del calendario
- [x] Requisitos para aprobar que se revisan solos con las notas, y un ícono que los explica
- [x] Editar, agregar y quitar requisitos en la ventana del ramo
- [x] Deshacer el borrado de una evaluación o tarea (durante 5 minutos)
- [x] [Eximirse del examen](decisiones/0019-programas-con-ia.md): la IA marca de qué se exime, y la nota se calcula suponiendo que te eximes, con una nota que lo avisa
- [x] [Cuentas y personas de prueba](decisiones/0020-cuentas-de-prueba.md) al desarrollar: entrar con un botón y ver amigos estudiando en una sala
- [x] [Horario de la semana](decisiones/0021-horario-semanal.md): se agregan a mano las clases de cada ramo (tipo, veces por semana, día y hora), y la semana se ve en Inicio y en la carpeta, con los topes marcados
- [x] [Modo oscuro](decisiones/0022-modo-oscuro.md): en Perfil se elige automático, claro u oscuro
- [x] Perfil se abre desde tu foto y nombre, abajo en el menú (arriba a la derecha en el celular), en vez de tener su propio enlace
- [x] [El ramo en la tarjeta y la página del perfil](decisiones/0023-perfil-de-cada-persona.md): al hacer clic en alguien en la sala se ve qué ramo estudia, y su nombre abre su perfil en otra pestaña
- [x] [La música en todo momento](decisiones/0024-musica-en-todo-momento.md): también en el menú, y salir de la sala ya no la corta
- [x] [En línea y chat entre amigos](decisiones/0025-en-linea-y-chat.md): en línea con StudyFocus abierto (o ausente), "activo hace…", y chat con sin leer, visto y escribiendo, también dentro de la sala
- [x] Una cuenta en la misma sala desde dos ventanas: pregunta si cambiar la sesión a la nueva, y la otra vuelve al menú
- [x] [La cámara con la tecla C](decisiones/0004-camaras-al-estudiar.md): un aviso pequeño abajo a la izquierda en vez del panel de cámaras
- [ ] Chat de sala
- [ ] Que el video de YouTube no deje un cuadro negro al salir de su pantalla completa
- [x] Ordenar las evaluaciones de un ramo arrastrándolas (o con las flechas del teclado)
- [ ] Agregar `GEMINI_API_KEY` en Render para la versión publicada
- [x] Inicio en dos columnas: ¿Estudiamos? y tu carpeta más reciente con el punteo de sus ramos a la izquierda, y los próximos 7 días en una columna a la derecha

**Terminada cuando:** creo mis ramos y mis pruebas, estudio solo o con amigos eligiendo el ramo, y en Inicio veo cuánto llevo hoy, mi racha y lo que viene.

Después vienen Repasar, con tarjetas de memoria, y adaptar la página al celular.

## Cómo trabajamos cada tarea

1. **Definir:** una tarea pequeña que diga cuándo se considera terminada.
2. **Implementar:** primero el concepto, luego el código.
3. **Probar:** comprobar que funciona y que `npm run build` compila.
4. **Subir:** hacer commit y push directo a `main`.

Trabajamos sin ramas ni pull requests porque hay una sola persona en el proyecto. Si se suma alguien más, conviene retomarlos.
