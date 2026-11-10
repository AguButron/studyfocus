# 0023: El ramo en la tarjeta y la página del perfil de cada persona

**Estado:** aceptada.

**Fecha:** 2026-11-09

## Contexto

Dentro de una sala, al hacer clic en una persona aparece una tarjeta con su estado, su actividad y lo que cuenta de sí. No se veía qué estaba estudiando, y no había un lugar donde conocerla mejor.

## Decisión

- **El ramo en la tarjeta.** Si la persona eligió qué está estudiando, su tarjeta muestra el ramo con su color y su sigla (por ejemplo, "Taller de Arquitectura · ARQ2010").
  - La página ya le mandaba al servidor el apartado elegido, para anotar el tiempo. Ahora el servidor busca su nombre, su sigla y su color (solo si el apartado es de esa misma cuenta) y los pasa a los demás de la sala junto con su estado.
  - Se ve en cualquier sala, para cualquiera que esté en ella. No se muestran las notas ni nada más del ramo.
- **La página del perfil**, en `/?perfil=usuario`. En la tarjeta, el nombre de la persona es un link (con ↗) que la abre en **otra pestaña**, para no salir de la sala ni cortar el temporizador. La página muestra:
  - su foto, su apodo, su nombre de usuario y desde cuándo está en StudyFocus;
  - dónde está ahora, solo si son amigos (como en la lista de Amigos), con un botón para entrar a su sala;
  - lo que cuenta de sí: qué estudia, dónde, su país y su descripción;
  - cuánto ha estudiado: los últimos 7 días, su racha y el total, más el gráfico de su semana;
  - un botón según la relación: "Agregar como amigo", "Aceptar su solicitud", "Solicitud enviada" (con "Cancelar solicitud"), "Son amigos", o "Editar tu perfil" si es la propia.
- **Es una sección más de la app**, con el mismo menú y el mismo tema, pero sin un enlace propio en el menú. La dirección mantiene el `?perfil=` mientras está abierta, así que se puede recargar o compartir. Al ir a otra sección o entrar a una sala, la dirección se limpia.
- **Hay que haber iniciado sesión** para verla. Quien llega sin sesión, entra y luego ve el perfil.

## Alternativas descartadas

- **Abrir el perfil en la misma pestaña:** sacaría a la persona de la sala y cortaría su periodo de estudio.
- **Una ventana dentro de la sala:** la tarjeta ya cumple ese papel; el perfil completo necesita más espacio.
- **Mostrar los ramos que más estudia:** puede ser algo que la persona no quiera mostrar. Por ahora solo se ve el ramo que eligió al estudiar, y solo mientras está en la sala.

## Consecuencias

- **Rutas nuevas:** `GET /api/perfil?usuario=…&tz=…` con los datos de la página. `POST /api/friends/request` acepta ahora `username`, además del código de amigo.
- **El estado de cada persona en la sala** suma `subject` (`{ name, code, color }` o `null`). Las personas de prueba Diego y Ema traen un ramo, para probar la tarjeta.
- **La racha** se cuenta en la zona horaria de quien mira la página.
