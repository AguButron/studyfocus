# 0008: Cuentas con Google o con correo y contraseña

**Estado:** aceptada

**Fecha:** 2026-11-02

## Contexto

La fase 6 necesita guardar el progreso de cada persona, y hoy nada sobrevive a un reinicio del servidor. Entrar con un link y un apodo es lo que hace simple a StudyFocus, así que no debe perderse.

## Decisión

- La cuenta es opcional: sin ella se sigue entrando con un apodo.
- Se puede iniciar sesión con Google o con una cuenta local de correo y contraseña.
- Los datos se guardan en PostgreSQL, en Neon, cuya dirección se indica con la variable `DATABASE_URL`. Sin esa variable, el servidor funciona sin cuentas.
- El servidor sigue usando `pg`, porque corre todo el tiempo en Render y puede mantener sus conexiones abiertas. Se conecta por la dirección `-pooler`, como recomienda Neon para el tráfico de la aplicación.
- El botón de Google entrega un token que el servidor verifica con `google-auth-library`. De Google se guarda solo su identificador y el nombre, no el correo.
- Las contraseñas se guardan con `scrypt`, que viene incluido en Node.
- La sesión es una cookie `HttpOnly`, para que el código de la página no pueda leerla, y en la base de datos solo se guarda un hash de ella.

## Alternativas descartadas

- **Solo Google:** es más simple, pero deja fuera a quien no quiere usarlo.
- **Unir las cuentas que tienen el mismo correo:** el correo local no está verificado, así que alguien podría crear una cuenta con el correo de otra persona y compartirla cuando esa persona entre con Google. Por eso son cuentas separadas.
- **Base de datos de Render:** en el plan gratis vence a los 30 días.
- **Guardar la sesión en `localStorage`:** cualquier código que corra en la página podría leerla.

## Consecuencias

- El inicio con Google quedó pospuesto el 2026-11-06. El código sigue, y el botón aparece solo al definir `GOOGLE_CLIENT_ID`.
- Una misma persona puede terminar con dos cuentas, si usa los dos métodos.
- Una contraseña olvidada todavía no se puede recuperar, ni se verifica que el correo sea de quien lo escribe: ambas cosas necesitan enviar correos.
- La consola de Google debe autorizar cada dirección desde la que se usa el botón, incluida la de desarrollo.
- Crear las tablas al arrancar basta por ahora. Cuando haya que cambiar tablas existentes, hará falta un sistema de migraciones.
