# 0030: Chat de sala

**Estado:** aceptada.

**Fecha:** 2026-11-14

## Contexto

Dentro de una sala solo se podía hablar con los amigos, uno por uno ([decisión 0025](0025-en-linea-y-chat.md)). Faltaba una forma de hablar con todos los que están en la sala, incluidos los que no son tus amigos. Al mismo tiempo, la idea central es la concentración: la [visión](../VISION.md) ya proponía un "chat solo en los descansos".

## Decisión

- **Lo leen y lo escriben todos los que están en la sala.** Al estudiar solo no hay chat de sala.
- **Bloqueado mientras estudias.** Con un periodo de estudio corriendo no se ven los mensajes ni se puede escribir. Si el chat estaba abierto, se cierra al empezar a estudiar. Se abre en el descanso, con el temporizador en pausa o sin empezar, o mientras eliges asiento. Mientras tanto, el botón muestra cuántos mensajes nuevos llegaron, y al apretarlo dice "el chat se abre en el descanso". El servidor también lo revisa: no acepta mensajes de quien está estudiando.
- **Se guarda mientras viva la sala.** Los últimos 100 mensajes quedan en la memoria del servidor y se borran cuando la sala queda vacía, igual que la sala. Un reinicio del servidor también los borra. No hay tabla en la base de datos.
- **Quien entra ve lo anterior,** y eso cuenta como leído: no aparece con 30 mensajes nuevos al entrar.
- **Un botón "Chat" aparte,** al lado de Amigos: en la barra de arriba mientras eliges asiento, y en la esquina al estar sentado. La ventana se despliega bajo el botón, como la de Amigos, y se cierra con ✕, Escape, el mismo botón o un clic fuera. Abrir una cierra la otra. En el celular tapa la pantalla entera.
- **Los mensajes:** texto y emojis, hasta 1000 caracteres, con los links clicables. Los mensajes de los demás llevan su foto y su nombre (uno solo para varios seguidos de la misma persona en 5 minutos), y el nombre abre su perfil en otra pestaña. Enter envía y Shift + Enter hace un salto de línea. Escribir no cambia la cámara (la tecla C).
- **"Escribiendo…"** con el nombre: "Ana está escribiendo…", "Ana y Beto están escribiendo…" o "Varias personas están escribiendo…".
- **Sin "Visto":** en un grupo dice poco y obliga a guardar quién leyó cada mensaje.
- **Límite:** 120 mensajes por cuenta cada 15 minutos.

### Lo aprendido del chat entre amigos

- **Sin conexión no se envía,** y los avisos van sin cola (`volatile`): un mensaje fallido no llega minutos después como si fuera nuevo. El texto queda escrito para reenviarlo.
- **Al volver a la sala tras perder la conexión, la página pide de nuevo lo anterior,** recién cuando ya volvió a entrar (no antes, porque el servidor todavía no sabría en qué sala está).
- **Cada aviso lleva el código de la sala:** si llega tarde a una página que ya salió, se descarta.
- **Un mensaje no se muestra dos veces,** aunque llegue por la respuesta y por el aviso a la sala.
- **Mensajes nuevos después de un reinicio del servidor:** el servidor vuelve a numerar los mensajes desde 1. Por eso manda un identificador que cambia con cada arranque (`boot`), y la página vuelve a contar desde cero si cambió. Lo leído se guarda por pestaña, así que recargar no borra el número de mensajes nuevos.
- **El tamaño máximo de un aviso de Socket.IO era de 1024 bytes,** y uno más grande cortaba la conexión. Un mensaje de 1000 caracteres pasaba ese límite, y con tildes o emojis bastaban unos 300. Esto afectaba también al chat entre amigos. Ahora es de 8 KB.

## Alternativas descartadas

- **Escribir siempre, también mientras se estudia:** rompe la concentración, que es la idea central.
- **Guardarlo en la base de datos:** sobreviviría a un reinicio, pero las salas son pasajeras, y sería más trabajo y más consultas.
- **Ver solo lo nuevo al entrar:** quien llega no se entera de lo que se habló.
- **Chat también en tu escritorio:** ahí estudias solo, así que no hay con quién hablar.
- **Ponerlo dentro de la ventana de Amigos:** se mezcla con los chats de a dos.

## Consecuencias

- **Servidor:** `server/src/roomChat.ts`. Por Socket.IO van `room-chat:history`, `room-chat:send` y `room-chat:typing`; el servidor responde con `room-chat:message` y `room-chat:typing` al grupo de la sala. `MAX_MESSAGE_SIZE` sube a 8 KB.
- **Página:** `client/src/roomChat.ts`. `network.ts` avisa con `onRoomRejoined` cuando se vuelve a la sala tras reconectar.
- **En el celular,** la barra de la sala ya no cabía antes de este cambio, y el botón Chat la alarga un poco más. Se arregla al adaptar la página al celular.
