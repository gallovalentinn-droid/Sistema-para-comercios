# Cierre de caja: finalización compacta

> **For agentic workers:** Use superpowers:executing-plans. Ejecutar en este worktree; revisión independiente al terminar.

**Goal:** Publicar únicamente la mejora de UX aprobada para caja única con separación de cigarrillos.
**Architecture:** Cambio acotado al HTML/CSS y eventos del cierre REV88. Conservar Contar → Revisar → Finalizar, cálculo por todos los medios, validadores, backup y confirmación durable existentes.
**Tech Stack:** HTML/CSS/JavaScript sin dependencias nuevas; Node y Playwright.
**Spec:** Boceto aprobado en conversación, `cierre-caja-finalizar-r3.html`: sin tarjeta naranja, sin repetir el conteo arriba, lápiz accesible, sin nota de backup; monto precargado y editable. La solicitud del 30/10 autoriza integración, capturas reales y publicación de este cambio de UX.

## Restricciones
- Base remota comprobada: `a40b40cb602603c8d132079c2c64c170761e062d` (REV88). No integrar los cambios de laboratorio REV89–93.
- La precarga es el total cobrado de cigarrillos, incluso si supera el efectivo: mostrar error y exigir edición; no recortar el valor silenciosamente.
- Conservar lo editado al volver entre pasos y no cerrar mientras se edita un importe sin guardar.
- No cambiar contratos, permisos, SQL, datos reales ni la ejecución del backup.
- Identidad nueva y coherente en HTML/SW/manifiesto; publicación mediante avance normal de main.

## Review Focus
- Total cero, centavos y monto requerido mayor al contado.
- Cancelar una edición restaura el importe anterior y el reparto.
- Cambiar el conteo invalida la elección del destino, sin perder el apartado editado.
- Confirmación del cierre conserva stock, referencias y retiro sin duplicar cigarrillos.
- Capturas y repetición pública con datos sintéticos y escrituras externas bloqueadas.

## Tarea 1: interacción y presentación
- [ ] Agregar regresión de navegador para precarga por todos los medios, lápiz, editar/cancelar, exceso de efectivo, vuelta entre pasos y cierre durable.
- [ ] Ejecutarla roja sobre REV88.
- [ ] Reemplazar el bloque naranja por texto/input/pencil y detalle plegado; conservar IDs de los campos y validación financiera.
- [ ] Añadir edición explícita con Guardar/Cancelar y resumen compacto; ejecutar regresión y suite de caja.

## Tarea 2: salida
- [ ] Revisar el diff completo; comprobar revisión libre y alinear HTML/SW/manifiesto.
- [ ] Ejecutar toda la suite Node y todas las suites browser locales, conservando resultados.
- [ ] Capturar pantallas reales en 390 y 1366; sin backend real.
- [ ] Revisión independiente, corregir bloqueantes, commit y push normal de ese SHA a main.
- [ ] Comprobar Pages, hashes públicos y repetir caja sobre HTML público con backend simulado.
