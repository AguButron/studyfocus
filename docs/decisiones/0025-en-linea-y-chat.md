# 0025: En línea y chat entre amigos

**Estado:** aceptada.

**Fecha:** 2026-11-09

## Contexto

Un amigo solo se veía conectado si estaba en una sala o estudiando solo; con StudyFocus abierto en el menú parecía desconectado. Además, no había forma de hablar con los amigos dentro de la app. Más adelante se quiere un chat por sala.

## Decisión

### Quién está conectado

- **En línea:** tiene StudyFocus abierto en alguna pestaña, con la sesión iniciada.
- **Ausente:** tiene StudyFocus abierto, pero no lo usa hace 10 minutos. La página avisa al servidor que la estás usando (un clic, una tecla, volver a la pestaña) como mucho una vez por minuto.
- **En una sala o estudiando solo:** como antes, y tiene prioridad.
- **Desconectado:** al cerrar la última pestaña se guarda la hora (`users.last_seen_at`). Sus amigos ven "Activo hace 2 horas", en la lista y en su perfil; los demás no lo ven.

### El chat

- **Solo entre amigos.** Si dejan de serlo, la conversación queda en "Conversaciones anteriores" para leerla, pero no se puede escribir. Si vuelven a ser amigos, sigue donde estaba.
- **Se abre desde la pestaña de Amigos de la derecha.** Al apretar un amigo, su conversación sale en una ventana a la izquierda de la pestaña, encima de todo, y la lista sigue a la vista con ese amigo marcado. Sale a la altura del amigo que se apretó, con una flecha que lo apunta (sin salirse de la pantalla). Se cierra con ✕ o Escape. En el celular la ventana tapa la pantalla entera. En la sección Amigos, cada amigo tiene un botón "Escribir". (Hasta el 2026-11-10, la conversación reemplazaba a la lista dentro de la pestaña).
- **Su foto y su nombre**, arriba del chat, abren su perfil **siempre en otra pestaña**, para no cortar una sesión de estudio.
- **Dentro de la sala también:** un botón en la barra de arriba (o en la esquina si estás sentado) muestra las fotos de hasta 3 amigos en línea, "+N" si hay más, y los mensajes sin leer; sin nadie conectado dice "Amigos". Al apretarlo, la lista se despliega bajo el botón como una ventana compacta y semitransparente, del alto justo, y el chat sale a su lado. Se cierra con el mismo botón, con Escape o con un clic en la sala (y se cierra también el chat). Hasta el 2026-11-10 era un panel de alto completo, igual al del menú. Escribir en el chat no mueve al personaje ni cambia la cámara.
- **En el celular,** donde el menú no tiene la columna de la derecha, la pestaña también flota: se abre con "Escribir" y se cierra con ✕.
- **Mensajes:** texto y emojis, hasta 1000 caracteres. Los links se abren con un clic, en otra pestaña. Se guardan siempre: al abrir una conversación se cargan los últimos 50, y subiendo, los anteriores. Enter envía; Shift + Enter hace un salto de línea.
- **Al instante:** los mensajes, el "Visto" y el "Escribiendo…" llegan por la conexión de Socket.IO que ya tiene cada pestaña. Cada cuenta tiene su propio grupo en Socket.IO, así le llega a todas sus pestañas abiertas.
- **Sin leer:** un número en cada amigo, en el encabezado de la pestaña, en el botón de Amigos de la sala y junto a Amigos en el menú (sumado a las solicitudes). Una conversación se marca como leída cuando está abierta y a la vista.
- **Visto:** tu último mensaje dice "Enviado" o "Visto".
- **Escribiendo…:** aparece unos segundos mientras la otra persona escribe. La página lo avisa cada 2,5 segundos como mucho, no en cada tecla.
- **Límite:** 120 mensajes por cuenta cada 15 minutos, para frenar a quien manda en ráfaga.
- **Sin conexión no se envía (2026-11-10):** Socket.IO guarda lo que se envía mientras está desconectado y lo manda al reconectar. Así, un mensaje que había mostrado "No se pudo enviar" llegaba minutos después, como si fuera nuevo. Ahora, sin conexión, el chat avisa y deja el texto escrito para reenviarlo. Los mensajes, el "Escribiendo…" y el aviso de actividad se envían sin quedar en cola (`volatile`).

### Una cuenta en la misma sala desde dos ventanas

Si entras a una sala en la que tu cuenta ya está desde otra ventana, aparece "Parece que ya estás en esta sala: ¿cambiar la sesión a esta ventana?". Si aceptas, la ventana nueva entra y la anterior vuelve al menú con el aviso "Seguiste en otra ventana". Antes, la misma persona aparecía dos veces en la sala.

**Estudiando solo, igual (2026-11-11):**
- Si ya estás estudiando solo en otra ventana y vuelves a apretar "Estudiar solo", aparece "Ya estás estudiando solo: ¿cambiar la sesión a esta ventana?".
- Si aceptas, pasa lo mismo que en una sala: la ventana nueva empieza y la anterior vuelve al menú con el aviso.
- Una ventana que se cerró hace poco y todavía espera volver no cuenta: esa sesión se cierra sin preguntar.
- `room:create` recibe `takeOver` como tercer dato y puede responder `'duplicate'`.

**El progreso se sigue en la ventana nueva (2026-11-11), en salas y estudiando solo:**
- **El temporizador sigue donde iba:** si quedaban 4 minutos de estudio, la ventana nueva sigue con 4 minutos, corriendo o en pausa, con la misma duración elegida.
- **Lo estudiado en el periodo en curso también pasa:** al terminar el periodo cuenta completo. Antes, cambiar de ventana era abandonar el periodo.
- **Funciona entre dispositivos,** porque va por el servidor:
  - Cada pestaña manda en su estado su temporizador: la duración del estudio y del descanso, y cuánto falta.
  - Mientras corre, lo que falta se manda solo cuando cambia otra cosa, y el servidor descuenta el tiempo que pasó desde entonces.
  - Al cambiarse, el servidor pasa a la sesión nueva el periodo, lo estudiado y el temporizador, y se lo responde a la página nueva.
- **El ramo** que se estudiaba sigue el de la ventana nueva. En el mismo navegador es el mismo, porque se guarda para todo el navegador.

**Un arreglo de esa misma fecha:** la ventana que quedaba atrás solo volvía al menú si se veía la barra de arriba. Sentado en la sala, o en tu escritorio, esa barra se esconde, así que esa ventana seguía igual. Ahora se fija en si está fuera del menú.

## Alternativas descartadas

- **Escribirle a cualquiera, o con solicitud:** necesitaría bloquear y denunciar desde el comienzo.
- **Una sección Mensajes aparte, o ventanas flotantes como en Facebook:** se prefirió tenerlo junto a la lista de amigos.
- **Avisar con un sonido o un cuadro en pantalla:** por ahora basta el número de sin leer.
- **Borrar la conversación al dejar de ser amigos:** se perdería lo hablado.

## Consecuencias

- **Base de datos:** `users.last_seen_at` y una tabla nueva, `messages` (de quién, para quién, el texto, cuándo y cuándo se leyó).
- **Rutas y avisos:**
  - `GET /api/chat?con=…&antes=…` carga una conversación por páginas.
  - `POST /api/chat/leido {con, hasta}` marca como leído lo que te llegó hasta ese mensaje y responde cuántos siguen sin leer. Va por HTTP y no por Socket.IO: así cuenta la misma cuenta con que se cargó la conversación, y la página sabe si quedó guardado.
  - Por Socket.IO van `chat:send`, `chat:typing` y `presence:active`. El servidor responde con `chat:message`, `chat:read`, `chat:unread`, `chat:typing` y `session:replaced`.
  - `room:join` recibe un tercer dato, `takeOver`.
- **`GET /api/friends`** suma, por amigo, `lastSeen` y `unread`, y la lista `pastChats`. La presencia ahora dice su `status`: `room`, `solo`, `online` o `away`.
- **Una cuenta por navegador a la vez:** la sesión es la misma en todas las pestañas. Si en una se entra con otra cuenta, las demás se recargan con esa cuenta, porque antes seguían mostrando la anterior mientras su conexión ya era de la nueva, y lo que marcaban como leído no contaba. El servidor también avisa con qué cuenta se conectó cada pestaña (`account:hello`). Para usar dos cuentas a la vez hay que abrir una ventana de incógnito u otro navegador.
- **Si el aviso de leído no llega**, la próxima vez que la lista de amigos dice que la conversación abierta tiene mensajes sin leer, la página lo manda de nuevo.
- **El orden de los mensajes** va por el número del mensaje (`messages.id`), no por su texto. Hasta el 2026-11-10 se ordenaba sin querer como texto, y "9" quedaba después de "51". Así la página tomaba un mensaje viejo como el último, marcaba como leído solo hasta ahí, y el número de sin leer volvía al recargar.
- **El chat de sala**, para más adelante, puede usar el mismo mecanismo con el grupo de Socket.IO de cada sala.
- **Las cuentas de prueba** se volvieron a crear el 2026-11-09 tras borrar las cuentas viejas de la base. Solo quedaron `@tevan` (antes `@prueba`) y `@joo`.
