# 0013: Nombre de usuario, apodo y perfil

**Estado:** aceptada

**Fecha:** 2026-11-07

## Contexto

Dos personas pueden tener el mismo apodo, y con amigos y salas compartidas hace falta distinguirlas. También se quiere que cada persona cuente algo de sí misma.

## Decisión

- Cada cuenta tiene un **nombre de usuario** único que no se puede cambiar: de 3 a 20 caracteres, con letras sin tildes, números, `_` y puntos, y que empieza con una letra. Se guarda en minúsculas, y algunos están reservados, como `admin`.
- Se puede iniciar sesión con el correo o con el nombre de usuario.
- El **apodo** es lo que se ve en la sala. Se puede cambiar una vez cada 30 días; el primer cambio no espera.
- Las cuentas creadas antes de esto, y las de Google, eligen su nombre de usuario la primera vez que entran.
- El **perfil** tiene qué estudias, dónde, la nacionalidad y una descripción de hasta 300 caracteres. Todo es opcional, y lo ve cualquiera con sesión iniciada al hacer clic en la persona dentro de una sala. El correo nunca se muestra.
- Al crear una cuenta, el correo debe tener una forma válida y un dominio que pueda recibir correos, según el DNS. Si el DNS no responde, no se bloquea el registro.

## Consecuencias

- Revisar el dominio no prueba que el correo sea de quien lo escribe. Para eso falta enviar un correo de verificación.
- La foto de perfil queda para después: necesita dónde guardar las imágenes.
