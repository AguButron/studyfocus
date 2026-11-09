# 0022: Modo oscuro

**Estado:** aceptada.

**Fecha:** 2026-11-09

## Contexto

La interfaz ya tenía un tema oscuro, Grafito, pero solo se usaba dentro de las salas. Fuera de ellas, la app siempre se veía en claro (Papel), y no había forma de cambiarlo.

## Decisión

- **En Perfil, "Apariencia"** ofrece tres opciones:
  - **Automático:** usa el tema del computador o celular, y cambia si el sistema cambia. Es la opción por defecto.
  - **Claro:** siempre Papel.
  - **Oscuro:** siempre Grafito.
- **Dentro de una sala** la interfaz sigue siendo siempre oscura, como antes.
- **La elección se guarda en el navegador** (`studyfocus.theme`), no en la cuenta. Así cada dispositivo puede tener la suya, y no hace falta tocar el servidor.
- **Sin parpadeo:** un script corto en `index.html` aplica el tema antes de pintar la página, para que no se vea un instante en claro. El resto está en `client/src/theme.ts`.

## Consecuencias

- Al revisar los colores en oscuro aparecieron textos sobre amarillo que no se leían: el día de hoy en el calendario y el contador de amigos usaban el color del texto normal, que en oscuro es claro. Ahora usan `--on-marker`, el color pensado para ir sobre el amarillo.
- El verde de "cumplido" o "creado" era un color fijo, demasiado oscuro sobre Grafito. Ahora es un color del tema, `--ok-ink`.
- Cualquier color nuevo debe venir de los colores del tema, no escrito fijo, para que se vea bien en ambos.
