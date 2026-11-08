# 0016: StudyFocus pasa a ser una plataforma de estudio

**Estado:** aceptada

**Fecha:** 2026-11-08

## Contexto

StudyFocus nació como una sala 3D para estudiar con amigos. Se quiere que sea la plataforma donde un estudiante organiza, hace y mide todo su estudio, y que estudiar con amigos en una sala sea una de sus funciones.

## Decisión

### Para quién

Para universitarios y escolares. Por eso las partes propias de la universidad, como el semestre, son opcionales.

### El menú

**Inicio**, **Estudiar**, **Ramos**, **Estadísticas**, **Amigos**, **Tienda** y **Perfil**. Las salas actuales pasan a vivir dentro de **Estudiar**. Más adelante se suma **Repasar**, con tarjetas de memoria.

### Estudiar solo

- Se puede estudiar sin entrar a una sala con amigos, de dos formas a elegir:
  - **Pantalla simple:** sin 3D, con el temporizador, la música y el ramo. Carga al tiro.
  - **Tu pieza:** una sala 3D distinta, con una sola mesa y una sola silla, solo tuya. Nadie más puede entrar. Más adelante será la pieza personal de cada persona, que podrá decorar.
- El temporizador funciona igual que en una sala, y el tiempo cuenta igual en las estadísticas.
- Tus amigos te ven como "Estudiando solo" en su lista, pero no pueden unirse.

### Ramos

- Solo el nombre y el color son obligatorios. Además se puede anotar la sigla, una meta semanal de horas, el semestre o año, el profesor y la sala.
- Elegir un ramo antes de un periodo es opcional. Sin elegir, el tiempo queda como "Sin ramo".
- En una sala con amigos, cada persona elige su propio ramo, y los demás lo ven en su tarjeta.
- Al terminar el semestre, los ramos se archivan a mano: dejan de aparecer al elegir ramo, pero sus horas siguen en las estadísticas.

### Pruebas y tareas

- Cada una tiene título, fecha, ramo y tipo: prueba, tarea, trabajo o presentación.
- Las tareas se marcan como hechas. Las pruebas que ya pasaron se archivan solas.
- Se puede anotar la nota obtenida. El promedio del ramo es ponderado: cada evaluación tiene su porcentaje, y se muestra cuánto falta por evaluar.
- Cada ramo elige su escala de notas (por ejemplo, de 1,0 a 7,0 o de 0 a 100) y su porcentaje de exigencia, que dice qué porcentaje del puntaje da la nota de aprobación.

### Inicio

Cambiado por la [decisión 0017](0017-agenda-y-calendario.md): Inicio es un calendario con la agenda y sus avisos.

- Lo estudiado hoy, la racha de días y una meta diaria de horas que elige cada persona, aparte de las metas de los ramos.
- Las próximas pruebas y tareas, ordenadas por fecha.
- Los amigos que están estudiando ahora, para unirse a su sala.
- Un botón **Estudiar** para partir directo: solo o en una sala, eligiendo el ramo.
- Es lo primero que se ve con la sesión iniciada, y el logo lleva a Inicio. La portada queda solo para quien no ha iniciado sesión (cambio del 2026-11-08). La primera versión muestra lo estudiado hoy, la racha, los últimos 7 días y una tarjeta por cada opción.

### Orden

1. Estudiar solo: la pantalla simple y tu pieza.
2. Ramos: elegirlos en el temporizador y verlos en las estadísticas.
3. Pruebas y tareas, con notas y promedios.
4. Inicio, que junta todo lo anterior.

El celular queda para después: las secciones nuevas se piensan primero para computador.

## Alternativas descartadas

- **Que la sala propia se pueda abrir a amigos:** se prefirió que sea solo tuya, para que se convierta en tu pieza personal. Para estudiar con amigos se crea una sala aparte, como ahora.
- **Que el ramo sea obligatorio:** daría estadísticas más completas, pero agrega un paso cada vez que se quiere empezar.

## Consecuencias

- Estudiar solo usa por dentro una sala de tipo `solo`, privada y de una persona. Así reutiliza todo lo que ya existe: el servidor mide el tiempo igual, vuelve tras recargar o tras un reinicio, y los amigos ven la presencia, pero sin el código. Nadie puede unirse a ella, ni con el código.
- La pantalla simple es la misma página, sin dibujar la sala 3D: el temporizador al centro y la música.
- El servidor debe guardar el ramo de cada tramo de estudio para las estadísticas por ramo.
- Pendiente de decidir: si en la pantalla se dice "ramos" o "asignaturas", porque el término cambia entre la universidad y el colegio.
