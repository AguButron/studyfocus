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

## Alternativas descartadas

- **Escribirle a cualquiera, o con solicitud:** necesitaría bloquear y denunciar desde el comienzo.
- **Una sección Mensajes aparte, o ventanas flotantes como en Facebook:** se prefirió tenerlo junto a la lista de amigos.
- **Avisar con un sonido o un cuadro en pantalla:** por ahora basta el número de sin leer.
- **Borrar la conversación al dejar de ser amigos:** se perdería lo hablado.

## Consecuencias

- **Base de datos:** `users.last_seen_at` y una tabla nueva, `messages` (de quién, para quién, el texto, cuándo y cuándo se leyó).
- **Rutas y avisos:**
  - `GET /api/chat?con=…&antes=…` carga una conversación por páginas.
  - Por Socket.IO van `chat:send`, `chat:read`, `chat:typing` y `presence:active`. El servidor responde con `chat:message`, `chat:read`, `chat:unread`, `chat:typing` y `session:replaced`.
  - `room:join` recibe un tercer dato, `takeOver`.
- **`GET /api/friends`** suma, por amigo, `lastSeen` y `unread`, y la lista `pastChats`. La presencia ahora dice su `status`: `room`, `solo`, `online` o `away`.
- **El chat de sala**, para más adelante, puede usar el mismo mecanismo con el grupo de Socket.IO de cada sala.
- **Las cuentas de prueba** se volvieron a crear el 2026-11-09 tras borrar las cuentas viejas de la base. Solo quedaron `@tevan` (antes `@prueba`) y `@joo`.
