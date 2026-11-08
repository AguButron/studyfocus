// Un ícono (i) que al pasar el mouse, o al enfocarlo con el teclado, muestra un texto de ayuda
const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></svg>'

let nextId = 1

// alignEnd abre el texto hacia la izquierda, para íconos que quedan cerca del borde derecho
export function createInfoTip(label: string, text: string, alignEnd = false) {
  const tip = document.createElement('span')
  tip.className = alignEnd ? 'info-tip info-tip--end' : 'info-tip'
  tip.tabIndex = 0
  tip.setAttribute('aria-label', label)
  tip.innerHTML = ICON
  const box = document.createElement('span')
  box.className = 'info-tip-box'
  box.setAttribute('role', 'tooltip')
  box.id = `info-tip-${nextId++}`
  box.textContent = text
  tip.setAttribute('aria-describedby', box.id)
  tip.append(box)
  return tip
}

// Qué cuenta para un requisito: sus evaluaciones con su porcentaje, o el promedio final
export function describeRuleScope(names: { title: string; weight: number | null }[] | null) {
  if (names === null) return 'Cuenta el promedio final del ramo, con todas sus evaluaciones.'
  if (names.length === 0) return 'Sus evaluaciones ya no están en el ramo.'
  const lines = names.map(({ title, weight }) => `• ${title}${weight !== null ? ` (${String(weight).replace('.', ',')} %)` : ''}`)
  return `Cuenta para este requisito:\n${lines.join('\n')}`
}
