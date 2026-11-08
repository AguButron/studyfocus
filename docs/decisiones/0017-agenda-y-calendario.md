# 0017: La agenda, el calendario y lo que viene en Inicio

**Estado:** aceptada. Cambia lo que muestra Inicio en la [decisión 0016](0016-plataforma-de-estudio.md).

**Fecha:** 2026-11-08

## Contexto

La primera versión de Inicio repetía las opciones del panel de la izquierda. Se prefirió que lo primero que se vea sea lo que cada persona tiene que hacer esta semana.

## Decisión

- Inicio muestra arriba el saludo y, a su derecha, un resumen de tu estudio (hoy, racha y últimos 7 días). Debajo va una sola lista, **Próximos 7 días**: primero lo atrasado sin hacer y después cada día que tiene algo ("Hoy", "Mañana", "Martes 10"). Desde ahí se marca lo hecho, se agrega algo nuevo o se abre el calendario (cambio del 2026-11-08: antes el calendario estaba en Inicio).
- **El calendario** tiene su propia sección en el panel de la izquierda, y usa todo el ancho y el alto de la pantalla.
- Se ve por semana (de lunes a domingo, los siete días a la vista), por mes o por año (los doce meses en pequeño, con una marca en los días que tienen algo; al apretar un día se abre su semana y al apretar un mes, ese mes). Se avanza y retrocede con flechas, y **Hoy** vuelve a la fecha actual. Parte en el mes y se recuerda la última vista elegida.
- **La agenda** tiene cinco tipos: prueba, tarea, trabajo, presentación y recordatorio, cada uno con su color. Cada cosa lleva un título, una fecha y, si se quiere, una hora, notas y un aviso.
- **El aviso** dice cuántos días antes empieza a aparecer: el mismo día, 1, 2 o 3 días antes, o 1 semana antes. Al crear algo se propone uno según el tipo: 3 días para una prueba, 2 para un trabajo o una presentación, 1 para una tarea y el mismo día para un recordatorio.
- **El número junto a Inicio** cuenta los avisos: lo que entró en su aviso y aún no pasa, y las tareas, trabajos, presentaciones y recordatorios atrasados sin hacer, hasta un mes después.
- Todo menos las pruebas se puede marcar como hecho, desde el aviso o al editarlo. Lo hecho se ve tachado y deja de avisarse. Las pruebas no se marcan: cuando pasan, dejan de avisarse solas.
- Borrar pide un segundo clic.
- Las fechas son días del calendario, sin zona horaria. La página dice cuál es "hoy" para la persona.

## Alternativas descartadas

- **Avisos por correo o notificaciones del navegador:** necesitan un servicio de correo, o que el servidor envíe notificaciones aunque la página esté cerrada. Por ahora el aviso se ve al abrir StudyFocus.
- **Esperar a tener los ramos:** la agenda funciona sin ellos. Cuando existan, cada cosa podrá elegir su ramo, y las notas con ponderación se anotarán en las pruebas.

## Consecuencias

- La tabla `agenda_items` guarda la agenda de cada persona, con un máximo de 2.000 cosas por cuenta.
- Las opciones que antes estaban en Inicio quedan solo en el panel de la izquierda, que suma la sección Calendario.
