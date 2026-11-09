# 0021: Horario de la semana, armado a mano

**Estado:** aceptada.

**Fecha:** 2026-11-09

## Contexto

Los ramos guardaban su horario solo como una línea de texto ("Lun y Mié 10:00–11:20"). Con texto no se puede armar el horario de la semana ni ver los topes.

## Decisión

- **Cada ramo puede tener clases en la semana**, una por cada vez:
  - el día;
  - la hora de inicio y la de término;
  - el tipo: Clase, Taller, Ayudantía o Laboratorio;
  - la sala (opcional; si falta, se usa la del ramo).

  Cada ramo tiene hasta 20 clases.
- **Se ponen a mano, desde el horario.** El horario no se llena solo, y es opcional.
  - "+ Agregar" abre una ventana. Ahí se elige el ramo, el tipo, cuántas veces a la semana y el día y las horas de cada vez.
  - La hora de la primera vez se copia a las demás, porque lo típico es la misma hora en distintos días.
  - Si el ramo tiene el horario en texto (por ejemplo, el que leyó la IA del programa), la ventana lo muestra como ayuda.
- **Para cambiar o borrar**, se aprieta una clase de la grilla. Se abre la misma ventana con todas las clases de ese tipo de ese ramo (por ejemplo, las dos clases de Cálculo), y ahí se cambian o se borran juntas.
- **La IA no llena el horario.** Al leer un programa sigue sacando el horario en una línea de texto, que se guarda en el ramo.
- **El horario está en Inicio y en la carpeta.** En Inicio aparece el de la carpeta más reciente, debajo de ella. Junto al título, un selector permite elegir otra carpeta, y la elección se recuerda en ese navegador. El selector solo aparece si hay más de una carpeta activa con ramos. En la carpeta, debajo de sus ramos. En ambos:
  - una columna por día, de lunes a viernes, más sábado y domingo solo si hay clases esos días;
  - las horas van desde la primera clase hasta la última;
  - cada clase va con el color de su ramo;
  - el día de hoy está destacado, con una línea en la hora actual;
  - si dos clases chocan (un tope de horario), se ponen lado a lado y se marcan.

  En pantallas angostas la grilla se desplaza hacia el lado dentro de su recuadro, sin mover la página.
- **El detalle del ramo** muestra sus clases resumidas ("Clase Lun y Mié 10:00–11:20"), o el texto del horario si todavía no tiene clases.

## Alternativas descartadas

- **Que la IA llene el horario desde el programa:** se probó. Pero muchos programas dicen solo el módulo, o traen varias secciones, y corregir lo que la IA puso costaba más que ponerlo a mano.
- **Editar las clases en la ventana del ramo:** el horario es el lugar natural, porque ahí se ve dónde queda cada clase.
- **Las clases en el calendario:** lo llenarían de eventos que se repiten cada semana (como ya se decidió en la [0019](0019-programas-con-ia.md)).

## Consecuencias

- **Base de datos:** `sections` suma `classes` (JSON, por defecto una lista vacía).
- **Servidor:** las clases se guardan con su propia ruta, `POST /api/apartados/clases`. Editar el ramo no las toca.
