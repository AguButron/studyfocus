import type { IncomingMessage, ServerResponse } from 'node:http'
import { requireAccount } from './accounts.ts'
import { MAX_ITEMS, parseItem } from './agenda.ts'
import { query, withTransaction } from './database.ts'
import { allowAttempt, createJsonHandler, readBody, RequestError, sendJson } from './requests.ts'
import {
  listSpaces,
  MAX_REQUIREMENTS_LENGTH,
  MAX_RULES,
  MAX_SECTIONS_PER_SPACE,
  parseId,
  parseRules,
  parseSection,
  SECTION_COLORS,
  type Rule,
} from './spaces.ts'

// Los programas de los cursos: se suben en PDF, una IA saca sus datos (evaluaciones, fechas, porcentajes,
// requisitos), la persona los revisa, y recién ahí se crean los apartados con sus evaluaciones.
// Los PDF no se guardan: se leen y se descartan.

// Programas por persona cada 24 horas, para no agotar la cuota de la IA entre todos.
// SYLLABUS_DAILY_LIMIT lo cambia; 0 es sin límite, para probar en desarrollo.
const DAILY_READS = readDailyLimit()

function readDailyLimit() {
  const value = Number(process.env.SYLLABUS_DAILY_LIMIT ?? 10)
  return Number.isInteger(value) && value >= 0 ? value : 10
}
const isUnlimited = () => DAILY_READS === 0

// Cuántos le quedan; null es sin límite
async function remainingReads(accountId: string) {
  return isUnlimited() ? null : Math.max(0, DAILY_READS - (await countReads(accountId)))
}
const MAX_PDF_SIZE = 10 * 1024 * 1024 // bytes
const MAX_COURSES = 15 // por vez
const MAX_EVALUATIONS = 60 // por curso
const MAX_CREATE_BODY = 512 * 1024 // bytes: la revisión completa de varios cursos
const MAX_CHANGES = 60 // creaciones por cuenta cada 15 minutos
const AI_TIMEOUT = 60 * 1000 // milisegundos por modelo; si uno tarda más, se prueba el siguiente
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEFAULT_MODEL = 'gemini-3.5-flash'
const FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest'] // si el principal está saturado
const AI_KINDS = ['prueba', 'tarea', 'trabajo', 'presentacion']
// Con cuántos días de anticipación se avisa, como al crearlas a mano
const REMIND_DAYS: Record<string, number> = { prueba: 3, tarea: 1, trabajo: 2, presentacion: 2 }
const BUSY = 'La lectura con IA llegó a su límite por ahora. Prueba de nuevo en un rato.'

const PROMPT = `Eres un asistente que lee programas de cursos universitarios o escolares y arma la planilla de notas del curso.
Responde solo con lo que dice el documento; nunca inventes datos. Escribe en español.

QUÉ ENTRA EN LA PLANILLA: solo las evaluaciones que aportan a la nota final, y nada más.
- Ignora bonus, décimas extra, puntos adicionales, la nota máxima, las políticas de atraso, la asistencia, las sanciones por copia, las evaluaciones recuperativas o de última instancia, y cualquier cosa opcional que reemplace a otra nota.
- Si una evaluación tiene partes con nota propia (por ejemplo una tarea con nota de entrega y nota de control), cada parte es una evaluación por separado.
- Cada evaluación va por separado, con su propio nombre ("Taller 1", "Taller 2", … "Taller 5"), aunque el documento las agrupe. Si el documento dice cuántas hay, crea esa cantidad. Solo si no dice cuántas son, o son más de 20, crea una sola que las represente, como "Controles (14)".

CÓMO SE CALCULA LA NOTA: los programas suelen armar la nota en niveles. Por ejemplo:
  NTSO = 0,3·T0 + 0,3·T1 + 0,3·T2 + 0,1·AC0;  NTR = 0,45·T3 + 0,45·T4 + 0,1·AC1;  NTF = 0,5·NTSO + 0,5·NTR;  NF = 0,5·NTF + 0,25·Midterm + 0,25·Examen;  y cada Ti = 0,7·Entrega + 0,3·Control.
No multipliques nada: describe la estructura tal cual, con grupos.
- groups: cada nota intermedia que el documento calcula (en el ejemplo: "NTF", "NTSO", "NTR", y "Tarea 0" si se compone de entrega y control).
  - name: el nombre que le da el documento, con una explicación corta si ayuda (por ejemplo "NTSO · Tareas de Sistemas Operativos").
  - parent: el índice (desde 0) del grupo que lo contiene, o -1 si va directo a la nota final.
  - weight: cuánto pesa dentro de su padre, en porcentaje (en el ejemplo NTF pesa 50 en la nota final, y NTSO pesa 50 dentro de NTF).
- evaluations: cada evaluación con nota, en el orden del curso.
  - group: el índice del grupo al que pertenece directamente, o -1 si va directo a la nota final.
  - weight: cuánto pesa dentro de su grupo, en porcentaje (en el ejemplo, T0 pesa 30 dentro de NTSO, y su control pesa 30 dentro de "Tarea 0"). Si va directo a la nota final, es su porcentaje de la nota final. Si un grupo se reparte en partes iguales sin decir cuánto vale cada una, divídelo en partes iguales. null si no se sabe.
  - Los pesos de lo que está directamente dentro de un mismo grupo (o directo en la nota final) deben sumar 100.
  - kind: "prueba" para pruebas, controles, interrogaciones, quizzes y exámenes; "tarea" para tareas, laboratorios, actividades y ejercicios; "trabajo" para proyectos, informes y trabajos; "presentacion" para presentaciones y disertaciones.
  - title: un nombre corto y claro, por ejemplo "Prueba 1", "Examen", "Tarea 0 · Entrega", "Tarea 0 · Control".
  - date: "YYYY-MM-DD" solo si el documento da el día exacto de esa evaluación (para una tarea, su entrega; para un control, el día del control). Deduce el año del semestre o del documento. Si dice una semana, un rango, "por definir", o nada, usa null.
  - time: "HH:MM" si aparece la hora exacta, si no null.

REQUISITOS PARA APROBAR (rules): cada condición por separado, tal como la pide el documento.
- "average": el promedio de un grupo debe ser al menos min (en el ejemplo, "NTSO ≥ 3,5", "NTR ≥ 3,5" y "NTF ≥ 3,95" son tres requisitos distintos).
- "each": cada evaluación indicada debe tener al menos min (por ejemplo "Midterm ≥ 3,5" y "Examen ≥ 3,95").
- "exempt": con un promedio de al menos min en esas evaluaciones, la persona se exime (por ejemplo, del examen). En exempts van los índices de las evaluaciones de las que se exime (por ejemplo, el examen); groups y evaluations dicen qué notas se promedian para eximirse. Si el documento ofrece eximirse, agrega siempre este requisito: la planilla calcula la nota suponiendo que la persona se va a eximir.
- groups: los índices de los grupos a los que se refiere; evaluations: los índices de evaluaciones sueltas. Usa groups siempre que el requisito sea sobre una nota intermedia. Si ambas listas quedan vacías, se refiere a la nota final del curso.
- exempts: solo en "exempt"; en los demás tipos, una lista vacía.
- label: una frase corta, por ejemplo "NTSO (tareas de Sistemas Operativos) ≥ 3,5", "Examen ≥ 3,95" o "Te eximes del examen con nota de presentación ≥ 5,0".
- "average" y "each" son solo requisitos para aprobar. Las condiciones para eximirse van solo como "exempt".
- Solo requisitos de nota, con min dentro de la escala de notas. La asistencia, los porcentajes de asistencia, las evaluaciones de pares y cualquier otra cosa que no sea una nota de la planilla no van en rules.

OTROS DATOS
- isSyllabus: false si el documento no es el programa de un curso.
- name: el nombre del curso. code: su sigla o código (por ejemplo MAT1620), o null.
- teacher: el o los profesores. schedule: el horario de clases en una línea. place: la sala. null si no aparece.
- sections: si el curso tiene varias secciones con distinto profesor, horario o sala (por ejemplo "Sección 1: Lunes y Miércoles módulo 2, sala B14, prof. Ruz"), una entrada por sección con su name ("Sección 1"), teacher, schedule y place. En ese caso deja en teacher, schedule y place solo lo que es igual para todas las secciones (o null). Si hay una sola sección, sections queda vacía.
- gradeMin, gradeMax, gradePass: la escala de notas y la nota de aprobación, si el documento las dice o es evidente por el país (en Chile, 1,0 a 7,0 y se aprueba con 4,0). exigencia: el porcentaje de exigencia solo si el documento lo dice; si no, null.
- requirements: un resumen breve, en palabras simples, de lo necesario para aprobar. Si se puede eximir de alguna evaluación, termina con una nota que lo diga, por ejemplo: "Puedes eximirte del examen con nota de presentación 5,0 o más; la nota se calcula suponiendo que te eximes."`

const NULLABLE_STRING = { type: 'STRING', nullable: true }
const NULLABLE_NUMBER = { type: 'NUMBER', nullable: true }
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    isSyllabus: { type: 'BOOLEAN' },
    name: { type: 'STRING' },
    code: NULLABLE_STRING,
    teacher: NULLABLE_STRING,
    schedule: NULLABLE_STRING,
    place: NULLABLE_STRING,
    sections: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { name: { type: 'STRING' }, teacher: NULLABLE_STRING, schedule: NULLABLE_STRING, place: NULLABLE_STRING },
        required: ['name', 'teacher', 'schedule', 'place'],
        propertyOrdering: ['name', 'teacher', 'schedule', 'place'],
      },
    },
    gradeMin: NULLABLE_NUMBER,
    gradeMax: NULLABLE_NUMBER,
    gradePass: NULLABLE_NUMBER,
    exigencia: NULLABLE_NUMBER,
    requirements: { type: 'STRING' },
    groups: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { name: { type: 'STRING' }, parent: { type: 'INTEGER' }, weight: NULLABLE_NUMBER },
        required: ['name', 'parent', 'weight'],
        propertyOrdering: ['name', 'parent', 'weight'],
      },
    },
    evaluations: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          kind: { type: 'STRING', enum: AI_KINDS },
          group: { type: 'INTEGER' },
          weight: NULLABLE_NUMBER,
          date: NULLABLE_STRING,
          time: NULLABLE_STRING,
        },
        required: ['title', 'kind', 'group', 'weight', 'date', 'time'],
        propertyOrdering: ['title', 'kind', 'group', 'weight', 'date', 'time'],
      },
    },
    rules: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          kind: { type: 'STRING', enum: ['average', 'each', 'exempt'] },
          label: { type: 'STRING' },
          min: { type: 'NUMBER' },
          groups: { type: 'ARRAY', items: { type: 'INTEGER' } },
          evaluations: { type: 'ARRAY', items: { type: 'INTEGER' } },
          exempts: { type: 'ARRAY', items: { type: 'INTEGER' } },
        },
        required: ['kind', 'label', 'min', 'groups', 'evaluations', 'exempts'],
        propertyOrdering: ['kind', 'label', 'min', 'groups', 'evaluations', 'exempts'],
      },
    },
  },
  required: ['isSyllabus', 'name', 'code', 'teacher', 'schedule', 'place', 'sections', 'gradeMin', 'gradeMax', 'gradePass', 'exigencia', 'requirements', 'groups', 'evaluations', 'rules'],
  propertyOrdering: ['isSyllabus', 'name', 'code', 'teacher', 'schedule', 'place', 'sections', 'gradeMin', 'gradeMax', 'gradePass', 'exigencia', 'requirements', 'groups', 'evaluations', 'rules'],
}

const MAX_GROUP = 20 // hasta cuántas evaluaciones de un grupo se separan una por una
const MAX_GROUPS = 30
const MAX_COURSE_SECTIONS = 12 // secciones de un mismo curso
const DEFAULT_EXIGENCIA = 50 // si el programa no la dice
const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const GROUP_TITLE = /^(.+?)\s*\((\d{1,2})\)$/ // "Talleres (5)"

// "Talleres" → "Taller", "Interrogaciones" → "Interrogación", "Tareas" → "Tarea"
function singular(word: string) {
  if (/ciones$/i.test(word)) return word.replace(/ciones$/i, 'ción')
  if (/siones$/i.test(word)) return word.replace(/siones$/i, 'sión')
  if (/[rlndz]es$/i.test(word)) return word.slice(0, -2)
  if (/s$/i.test(word)) return word.slice(0, -1)
  return word
}

// Reparte un porcentaje en partes que suman exacto: 33,33 en 5 da 6,67 + 6,67 + 6,67 + 6,66 + 6,66
function splitWeight(weight: number | null, parts: number) {
  if (weight === null) return Array<number | null>(parts).fill(null)
  const cents = Math.round(weight * 100)
  const base = Math.floor(cents / parts)
  return Array.from({ length: parts }, (_, index) => (base + (index < cents - base * parts ? 1 : 0)) / 100)
}

// Una evaluación como la entrega la IA: su peso es dentro de su grupo
type ReadEvaluation = { title: string; kind: string; group: number; weight: number | null; date: string | null; time: string | null }

// Si la IA juntó un grupo como "Talleres (5)", se separa en "Taller 1" … "Taller 5", cada uno con su parte.
// Devuelve también, para cada evaluación original, en qué posiciones quedó, para que los requisitos sigan apuntando bien.
function splitGroups(evaluations: ReadEvaluation[]) {
  const result: ReadEvaluation[] = []
  const positions: number[][] = []
  for (const item of evaluations) {
    const match = item.title.match(GROUP_TITLE)
    const count = match ? Number(match[2]) : 1
    if (!match || count < 2 || count > MAX_GROUP || result.length + count > MAX_EVALUATIONS) {
      positions.push([result.length])
      result.push(item)
      continue
    }
    const name = singular(match[1].trim())
    const weights = splitWeight(item.weight, count)
    positions.push([])
    for (let index = 0; index < count; index++) {
      positions.at(-1)!.push(result.length)
      // Solo la primera puede tener la fecha del grupo; las demás quedan sin fecha
      result.push({ ...item, title: `${name} ${index + 1}`, weight: weights[index], date: index === 0 ? item.date : null, time: index === 0 ? item.time : null })
    }
  }
  return { evaluations: result, positions }
}

function text(value: unknown, maxLength: number) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : null
}

function number(value: unknown, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? Math.round(value * 100) / 100 : null
}

function validDate(value: unknown) {
  if (typeof value !== 'string' || !DATE.test(value)) return null
  const date = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) ? value : null
}

const index = (value: unknown, length: number) => (Number.isInteger(value) && (value as number) >= 0 && (value as number) < length ? (value as number) : -1)

// Los grupos de la nota: cuánto pesa cada uno en la nota final (multiplicando por sus padres),
// y la cadena de grupos que contiene a cada uno. Un ciclo o un padre inválido se corta en la nota final.
function readGroups(raw: unknown) {
  const list = (Array.isArray(raw) ? raw : []).slice(0, MAX_GROUPS).map((group: Record<string, unknown>) => ({
    parent: index(group?.parent, MAX_GROUPS),
    weight: number(group?.weight, 0, 100),
  }))
  const chain = (start: number) => {
    const seen: number[] = []
    for (let current = start; current >= 0 && current < list.length && !seen.includes(current); current = list[current].parent) seen.push(current)
    return seen // el grupo, su padre, el padre de su padre…
  }
  // Fracción de la nota final que vale todo el grupo; null si algún peso en la cadena no se sabe
  const share = (group: number) => {
    if (group < 0 || group >= list.length) return 1
    let product = 1
    for (const item of chain(group)) {
      if (list[item].weight === null) return null
      product *= list[item].weight! / 100
    }
    return product
  }
  return { count: list.length, chain, share }
}

// Redondea a centésimas y, si la suma queda a menos de 0,05 de 100, ajusta la más grande para que dé exacto
function roundWeights(weights: (number | null)[]) {
  const rounded = weights.map((weight) => (weight === null ? null : Math.round(weight * 100) / 100))
  if (rounded.some((weight) => weight === null) || rounded.length === 0) return rounded
  const total = rounded.reduce((sum, weight) => sum! + weight!, 0)!
  const difference = Math.round((100 - total) * 100) / 100
  if (difference !== 0 && Math.abs(difference) <= 0.05) {
    const largest = rounded.lastIndexOf(Math.max(...(rounded as number[])))
    rounded[largest] = Math.round((rounded[largest]! + difference) * 100) / 100
  }
  return rounded
}

// Lo que responde la IA se ordena y se recorta: la persona lo revisa antes de guardar.
// Los porcentajes que se muestran son sobre la nota final: el peso dentro del grupo por el de cada grupo que lo contiene.
function normalizeCourse(raw: Record<string, unknown>) {
  const groups = readGroups(raw.groups)
  const read: ReadEvaluation[] = (Array.isArray(raw.evaluations) ? raw.evaluations : [])
    .slice(0, MAX_EVALUATIONS)
    .map((item: Record<string, unknown>) => ({
      title: text(item?.title, 100) ?? 'Evaluación',
      kind: AI_KINDS.includes(item?.kind as string) ? (item.kind as string) : 'prueba',
      group: index(item?.group, groups.count),
      weight: number(item?.weight, 0, 100),
      date: validDate(item?.date),
      time: typeof item?.time === 'string' && TIME.test(item.time) ? item.time : null,
    }))
  const { evaluations: split, positions } = splitGroups(read)
  const finalWeights = roundWeights(
    split.map((item) => {
      const share = groups.share(item.group)
      return item.weight === null || share === null ? null : item.weight * share
    }),
  )
  const evaluations = split.map(({ title, kind, date, time }, position) => ({ title, kind, date, time, weight: finalWeights[position] }))

  const gradeMin = number(raw.gradeMin, 0, 1000)
  const gradeMax = number(raw.gradeMax, 0, 1000)
  const gradePass = number(raw.gradePass, 0, 1000)
  const hasScale = gradeMin !== null && gradeMax !== null && gradePass !== null && gradeMin < gradePass && gradePass <= gradeMax

  // Un requisito sobre un grupo se refiere a todas las evaluaciones que caen dentro de él, a cualquier nivel
  const rules = (Array.isArray(raw.rules) ? raw.rules : []).slice(0, MAX_RULES).flatMap((rule: Record<string, unknown>) => {
    const kind = ['average', 'each', 'exempt'].includes(rule?.kind as string) ? (rule.kind as Rule['kind']) : null
    const label = text(rule?.label, 120)
    const min = number(rule?.min, 0, 1000)
    // Un requisito que no es una nota (como "asistencia ≥ 60 %") queda fuera de la escala y no se usa
    const low = hasScale ? gradeMin! : 0
    const high = hasScale ? gradeMax! : 1000
    if (!kind || !label || min === null || min < low || min > high) return []
    const ruleGroups = (Array.isArray(rule.groups) ? rule.groups : []).map((value) => index(value, groups.count)).filter((value) => value >= 0)
    const fromGroups = split.flatMap((item, position) => (groups.chain(item.group).some((group) => ruleGroups.includes(group)) ? [position] : []))
    // Los índices de evaluaciones de la IA se refieren a la lista antes de separar los grupos como "Talleres (5)"
    const toPositions = (list: unknown) =>
      (Array.isArray(list) ? list : [])
        .filter((value): value is number => Number.isInteger(value) && value >= 0 && value < read.length)
        .flatMap((value) => positions[value])
    const fromEvaluations = toPositions(rule.evaluations)
    // De qué se exime (por ejemplo, el examen): nunca de algo que también se promedia para eximirse
    const evaluations = [...new Set([...fromGroups, ...fromEvaluations])].sort((a, b) => a - b)
    const exempts = kind === 'exempt' ? [...new Set(toPositions(rule.exempts))].filter((value) => !evaluations.includes(value)) : []
    return [{ kind, label, min, evaluations, exempts }]
  })

  return {
    isSyllabus: raw.isSyllabus !== false,
    name: text(raw.name, 60) ?? 'Curso sin nombre',
    code: text(raw.code, 20),
    teacher: text(raw.teacher, 80),
    schedule: text(raw.schedule, 200),
    place: text(raw.place, 80),
    // Las secciones del curso, si tiene varias; la persona elige la suya al revisar
    sections: (Array.isArray(raw.sections) ? raw.sections : [])
      .slice(0, MAX_COURSE_SECTIONS)
      .map((section: Record<string, unknown>) => ({
        name: text(section?.name, 40) ?? 'Sección',
        teacher: text(section?.teacher, 80),
        schedule: text(section?.schedule, 200),
        place: text(section?.place, 80),
      }))
      .filter((section, _, all) => all.length > 1 && (section.teacher || section.schedule || section.place)),
    scale: hasScale
      ? { gradeMin, gradeMax, gradePass, exigencia: Math.round(number(raw.exigencia, 1, 99) ?? DEFAULT_EXIGENCIA) }
      : null,
    requirements: text(raw.requirements, MAX_REQUIREMENTS_LENGTH),
    evaluations,
    rules,
  }
}

async function readPdf(request: IncomingMessage) {
  if (request.headers['content-type'] !== 'application/pdf') throw new RequestError(415, 'Sube un archivo PDF.')
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_PDF_SIZE) throw new RequestError(413, 'El PDF pesa más de 10 MB.')
    chunks.push(chunk)
  }
  const pdf = Buffer.concat(chunks)
  if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new RequestError(415, 'Ese archivo no es un PDF.')
  return pdf
}

// La IA está en un solo lugar: cambiar a otra es cambiar esta función
type GeminiResult = { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string; details?: { retryDelay?: string }[] } }

const MAX_RETRY_WAIT = 40 * 1000 // milisegundos que se espera al modelo principal si pide esperar
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

// Cuánto pide esperar Google cuando se pasa el límite por minuto ("23s"), en milisegundos
async function readRetryDelay(response: Response) {
  try {
    const result = (await response.json()) as GeminiResult
    const delay = result.error?.details?.find((detail) => detail.retryDelay)?.retryDelay
    const seconds = delay ? Number.parseFloat(delay) : NaN
    return Number.isFinite(seconds) ? Math.ceil(seconds * 1000) + 500 : null
  } catch {
    return null
  }
}

// Una pregunta a Gemini. Si el modelo principal pasó su límite por minuto, se espera lo que pide y se reintenta;
// si sigue saturado, tarda demasiado o ya no existe, se prueba uno más liviano.
async function callGemini(key: string, parts: unknown[]) {
  const models = [...new Set([process.env.GEMINI_MODEL || DEFAULT_MODEL, ...FALLBACK_MODELS])]
  const body = JSON.stringify({
    contents: [{ role: 'user', parts }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA, temperature: 0.1 },
  })

  for (const [position, model] of models.entries()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let response: Response
      try {
        response = await fetch(`${GEMINI_URL}/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          signal: AbortSignal.timeout(AI_TIMEOUT),
          body,
        })
      } catch (error) {
        if (!(error instanceof Error && error.name === 'TimeoutError')) throw error
        console.warn(`Gemini ${model} tardó demasiado; se prueba otro modelo`)
        break
      }
      if (response.status === 429 && position === 0 && attempt === 0) {
        const delay = await readRetryDelay(response)
        if (delay !== null && delay <= MAX_RETRY_WAIT) {
          console.warn(`Gemini ${model} pidió esperar ${Math.round(delay / 1000)} s; se reintenta`)
          await wait(delay)
          continue
        }
      }
      if ([404, 429, 500, 503].includes(response.status)) {
        console.warn(`Gemini ${model} respondió ${response.status}; se prueba otro modelo`)
        break
      }
      const result = (await response.json()) as GeminiResult
      if (!response.ok) throw new Error(`Gemini respondió ${response.status}: ${result.error?.message ?? ''}`)
      return result.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
    }
  }
  throw new RequestError(503, BUSY)
}

function parseAnswer(answer: string) {
  try {
    return normalizeCourse(JSON.parse(answer))
  } catch {
    throw new RequestError(502, 'No se pudo leer este programa. Prueba con otro archivo.')
  }
}

// Suma de los porcentajes sobre la nota final; null si alguno no se sabe
function totalWeight(course: ReturnType<typeof normalizeCourse>) {
  if (course.evaluations.length === 0 || course.evaluations.some((item) => item.weight === null)) return null
  return course.evaluations.reduce((sum, item) => sum + item.weight!, 0)
}

// La IA está en un solo lugar: cambiar a otra es cambiar estas funciones
async function askAi(pdf: Buffer, fileName: string) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new RequestError(503, 'La lectura de programas no está configurada en este servidor.')

  // La fecha de hoy y el nombre del archivo ayudan a deducir el año cuando el programa no lo dice
  const today = new Date().toISOString().slice(0, 10)
  const context = `Hoy es ${today}. El archivo se llama "${fileName}". Si el documento no dice el año de una fecha, dedúcelo del semestre que indica el documento o el nombre del archivo; si tampoco lo dicen, usa el semestre actual o el próximo.`
  const parts = [{ inline_data: { mime_type: 'application/pdf', data: pdf.toString('base64') } }, { text: `${PROMPT}\n\n${context}` }]
  const course = parseAnswer(await callGemini(key, parts))

  // Si los porcentajes no suman 100, casi siempre es la estructura mal leída: se pide una vez más, diciendo qué pasó
  const total = totalWeight(course)
  if (total === null || Math.abs(total - 100) <= 0.5) return course
  console.warn(`Los porcentajes de "${course.name}" suman ${total.toFixed(2)}; se pide de nuevo`)
  const retry = parseAnswer(
    await callGemini(key, [
      ...parts,
      { text: `En un primer intento, los porcentajes sobre la nota final sumaron ${total.toFixed(2)} % en vez de 100 %. Revisa los pesos de cada grupo dentro de su padre y de cada evaluación dentro de su grupo, para que todo sume 100 %.` },
    ]).catch(() => null) ?? 'null',
  )
  const retryTotal = totalWeight(retry)
  return retryTotal !== null && Math.abs(retryTotal - 100) < Math.abs(total - 100) ? retry : course
}

async function countReads(accountId: string) {
  const { rows } = await query<{ count: number }>(
    `SELECT count(*)::int AS count FROM syllabus_reads WHERE user_id = $1 AND created_at > now() - interval '24 hours'`,
    [accountId],
  )
  return rows[0].count
}

// ── Crear lo revisado ─────────────────────────────────────────────────

interface ReviewedCourse {
  sectionId: string | null // un apartado que ya existe y se completa
  section: ReturnType<typeof parseSection>
  evaluations: ReturnType<typeof parseItem>[]
  weights: (number | null)[]
  rules: unknown
}

function parseCourse(raw: Record<string, unknown>): ReviewedCourse {
  if (!raw || typeof raw !== 'object') throw new RequestError(400, 'Formato no válido.')
  const name = typeof raw.name === 'string' ? raw.name : ''
  const evaluationsRaw = Array.isArray(raw.evaluations) ? raw.evaluations : []
  if (evaluationsRaw.length > MAX_EVALUATIONS) throw new RequestError(400, `${name}: usa hasta ${MAX_EVALUATIONS} evaluaciones.`)

  const evaluations = evaluationsRaw.map((item: Record<string, unknown>) => {
    try {
      return parseItem({ ...item, notes: null, remindDays: REMIND_DAYS[item?.kind as string] ?? 1 })
    } catch (error) {
      if (error instanceof RequestError) throw new RequestError(400, `${name}: ${error.message}`)
      throw error
    }
  })
  const weights = evaluationsRaw.map((item: Record<string, unknown>) => {
    if (item.weight === null || item.weight === undefined || item.weight === '') return null
    const weight = number(item.weight, 0, 100)
    if (weight === null) throw new RequestError(400, `${name}: cada porcentaje debe estar entre 0 y 100.`)
    return weight
  })

  return {
    sectionId: raw.sectionId ? parseId(raw.sectionId) : null,
    // El color se elige después, entre los que no usa la carpeta
    section: parseSection({ ...raw, color: SECTION_COLORS[0] }),
    evaluations,
    weights,
    rules: raw.rules,
  }
}

async function createCourses(accountId: string, spaceId: string, courses: ReviewedCourse[]) {
  return withTransaction(async (run) => {
    const { rows: spaces } = await run<{ id: string }>('SELECT id FROM spaces WHERE id = $1 AND user_id = $2 FOR UPDATE', [
      spaceId,
      accountId,
    ])
    if (!spaces[0]) throw new RequestError(404, 'Esa carpeta ya no existe.')

    const { rows: existing } = await run<{ id: string; color: string; rules: Rule[]; gradeMin: number; gradeMax: number }>(
      `SELECT id::text, color, rules, grade_min::float8 AS "gradeMin", grade_max::float8 AS "gradeMax"
       FROM sections WHERE space_id = $1 AND user_id = $2`,
      [spaceId, accountId],
    )
    const newCount = courses.filter((course) => !course.sectionId).length
    if (existing.length + newCount > MAX_SECTIONS_PER_SPACE) {
      throw new RequestError(409, `Cada carpeta tiene hasta ${MAX_SECTIONS_PER_SPACE} apartados.`)
    }
    const { rows: counted } = await run<{ count: number }>('SELECT count(*)::int AS count FROM agenda_items WHERE user_id = $1', [accountId])
    const itemCount = courses.reduce((sum, course) => sum + course.evaluations.length, 0)
    if (counted[0].count + itemCount > MAX_ITEMS) {
      throw new RequestError(409, `Llegaste al máximo de ${MAX_ITEMS} cosas en tu agenda. Borra algunas antiguas.`)
    }

    const usedColors = new Set(existing.map((section) => section.color))
    const nextColor = () => {
      const color = SECTION_COLORS.find((option) => !usedColors.has(option)) ?? SECTION_COLORS[usedColors.size % SECTION_COLORS.length]
      usedColors.add(color)
      return color
    }

    let createdSections = 0
    let createdItems = 0
    for (const course of courses) {
      const { section } = course
      let sectionId: string
      let previousRules: Rule[] = []
      let scale = { gradeMin: section.gradeMin, gradeMax: section.gradeMax }
      const knownItems = new Map<string, { id: string; date: string | null; weight: number | null }>()

      if (course.sectionId) {
        // Se completa: los datos que le falten, sin cambiar su escala ni lo que ya tenía
        const found = existing.find((item) => item.id === course.sectionId)
        if (!found) throw new RequestError(404, `${section.name}: ese apartado ya no existe.`)
        sectionId = found.id
        previousRules = found.rules
        scale = { gradeMin: found.gradeMin, gradeMax: found.gradeMax }
        await run(
          `UPDATE sections SET code = coalesce(code, $2), teacher = coalesce(teacher, $3), place = coalesce(place, $4),
             schedule = coalesce(schedule, $5), requirements = coalesce(requirements, $6)
           WHERE id = $1`,
          [sectionId, section.code, section.teacher, section.place, section.schedule, section.requirements],
        )
        const { rows: items } = await run<{ id: string; title: string; date: string | null; weight: number | null }>(
          `SELECT id::text, title, to_char(due_date, 'YYYY-MM-DD') AS date, weight::float8 AS weight
           FROM agenda_items WHERE section_id = $1 AND user_id = $2`,
          [sectionId, accountId],
        )
        for (const item of items) knownItems.set(item.title.toLowerCase(), item)
      } else {
        const { rows } = await run<{ id: string }>(
          `INSERT INTO sections (user_id, space_id, name, color, code, teacher, place, weekly_goal_minutes,
             grade_min, grade_max, grade_pass, exigencia, schedule, requirements)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id::text`,
          [accountId, spaceId, section.name, nextColor(), section.code, section.teacher, section.place, section.weeklyGoalMinutes,
            section.gradeMin, section.gradeMax, section.gradePass, section.exigencia, section.schedule, section.requirements],
        )
        sectionId = rows[0].id
        createdSections++
      }

      // Cada evaluación, en orden: las reglas se refieren a ellas por su posición
      const itemIds: string[] = []
      for (const [index, item] of course.evaluations.entries()) {
        const weight = course.weights[index]
        const known = knownItems.get(item.title.toLowerCase())
        if (known) {
          // Ya estaba: solo se completa la fecha o el porcentaje que le faltaban
          await run(
            `UPDATE agenda_items SET due_date = coalesce(due_date, $2), due_time = coalesce(due_time, $3), weight = coalesce(weight, $4)
             WHERE id = $1`,
            [known.id, item.date, item.time, weight],
          )
          itemIds.push(known.id)
          continue
        }
        const { rows } = await run<{ id: string }>(
          // En el orden del programa; al completar uno que existía, después de lo que ya tenía
          `INSERT INTO agenda_items (user_id, kind, title, due_date, due_time, remind_days, section_id, weight, position)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
             coalesce((SELECT max(position) + 1 FROM agenda_items WHERE section_id = $7), $9)) RETURNING id::text`,
          [accountId, item.kind, item.title, item.date, item.time, item.remindDays, sectionId, weight, course.sectionId ? null : index],
        )
        itemIds.push(rows[0].id)
        createdItems++
      }

      const rules = parseRules(course.rules, scale, (value) => {
        if (value === null || value === undefined) return null
        if (!Array.isArray(value)) throw new RequestError(400, 'Formato no válido.')
        return [...new Set(value.filter((index): index is number => Number.isInteger(index) && index >= 0 && index < itemIds.length).map((index) => itemIds[index]))]
      })
      // Al completar uno que existía, se suman los requisitos que no tenía
      const labels = new Set(previousRules.map((rule) => rule.label.toLowerCase()))
      const merged = [...previousRules, ...rules.filter((rule) => !labels.has(rule.label.toLowerCase()))]
        .slice(0, MAX_RULES)
        .map((rule, index) => ({ ...rule, id: String(index + 1) }))
      await run('UPDATE sections SET rules = $2 WHERE id = $1', [sectionId, JSON.stringify(merged)])
    }

    return { sections: createdSections, items: createdItems }
  })
}

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  const account = await requireAccount(request)
  const route = `${request.method} ${request.url?.split('?')[0]}`

  if (route === 'GET /api/programas/cupo') {
    sendJson(response, 200, { remaining: await remainingReads(account.id), daily: isUnlimited() ? null : DAILY_READS })
    return
  }

  if (route === 'POST /api/programas/leer') {
    if (!isUnlimited() && (await countReads(account.id)) >= DAILY_READS) {
      throw new RequestError(429, `Ya leíste ${DAILY_READS} programas en las últimas 24 horas. Podrás leer más mañana.`)
    }
    const pdf = await readPdf(request)
    // El nombre del archivo viaja codificado en un encabezado; ayuda a saber el año ("…_2026_2_Programa.pdf")
    let fileName = 'programa.pdf'
    try {
      fileName = decodeURIComponent(String(request.headers['x-file-name'] ?? fileName)).slice(0, 200)
    } catch {
      // Un nombre mal codificado no importa
    }
    // Se anota antes de llamar a la IA, así dos pedidos a la vez no se saltan el límite; si falla, se borra
    const { rows } = await query<{ id: string }>('INSERT INTO syllabus_reads (user_id) VALUES ($1) RETURNING id', [account.id])
    try {
      const course = await askAi(pdf, fileName)
      if (!course.isSyllabus) throw new RequestError(422, 'Este archivo no parece el programa de un curso.')
      sendJson(response, 200, { course, remaining: await remainingReads(account.id) })
    } catch (error) {
      if (!(error instanceof RequestError && error.status === 422)) {
        await query('DELETE FROM syllabus_reads WHERE id = $1', [rows[0].id])
      }
      if (error instanceof Error && error.name === 'TimeoutError') throw new RequestError(504, 'La lectura tardó demasiado. Prueba de nuevo.')
      throw error
    }
    return
  }

  if (route === 'POST /api/programas/crear') {
    if (!allowAttempt(`syllabus:${account.id}`, MAX_CHANGES)) {
      throw new RequestError(429, 'Demasiados cambios seguidos. Prueba de nuevo en unos minutos.')
    }
    const body = await readBody(request, MAX_CREATE_BODY)
    const spaceId = parseId(body.spaceId)
    if (!Array.isArray(body.courses) || body.courses.length === 0) throw new RequestError(400, 'Elige al menos un curso.')
    if (body.courses.length > MAX_COURSES) throw new RequestError(400, `Crea hasta ${MAX_COURSES} cursos a la vez.`)
    const courses = body.courses.map(parseCourse)
    const created = await createCourses(account.id, spaceId, courses)
    sendJson(response, 200, { ...created, spaces: await listSpaces(account.id), colors: SECTION_COLORS })
    return
  }

  throw new RequestError(404, 'No encontrado.')
}

export function createSyllabusHandler() {
  return createJsonHandler('los programas', handleRequest)
}
