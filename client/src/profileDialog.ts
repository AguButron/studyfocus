// El perfil de otra persona en una ventana: se abre desde la pestaña de amigos y desde la lista de Amigos
import { loadProfile } from './account'
import { createCharacterPhoto, type Character } from './character'
import { getCountryName, getFlag } from './countries'

export interface ProfilePerson {
  name: string
  username: string | null
  character: Character
  presence?: { text: string; kind: string; code: string | null } | null
}

const dialog = document.querySelector<HTMLDialogElement>('#profile-dialog')!
const photoBox = document.querySelector<HTMLDivElement>('#profile-dialog-photo')!
const nameText = document.querySelector<HTMLHeadingElement>('#profile-dialog-name')!
const usernameText = document.querySelector<HTMLSpanElement>('#profile-dialog-username')!
const presenceText = document.querySelector<HTMLSpanElement>('#profile-dialog-presence')!
const studiesText = document.querySelector<HTMLParagraphElement>('#profile-dialog-studies')!
const bioText = document.querySelector<HTMLParagraphElement>('#profile-dialog-bio')!
const emptyText = document.querySelector<HTMLParagraphElement>('#profile-dialog-empty')!
const joinButton = document.querySelector<HTMLButtonElement>('#profile-dialog-join')!

let request = 0 // descarta el perfil que llega tarde si mientras tanto se abrió otro
let joinCode: string | null = null
let onJoin: (code: string) => void = () => {}

function showDetails(studies: string, bio: string | null, isLoaded: boolean) {
  studiesText.textContent = studies
  studiesText.hidden = !studies
  bioText.textContent = bio ?? ''
  bioText.hidden = !bio
  emptyText.hidden = !isLoaded || Boolean(studies || bio)
}

export function setUpProfileDialog(joinRoom: (code: string) => void) {
  onJoin = joinRoom
  document.querySelector('#profile-dialog-close')!.addEventListener('click', () => dialog.close())
  // Un clic fuera de la ventana también la cierra
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })
  joinButton.addEventListener('click', () => {
    if (!joinCode) return
    dialog.close()
    onJoin(joinCode)
  })
}

export async function openProfile(person: ProfilePerson) {
  photoBox.replaceChildren(createCharacterPhoto(person.character, 'character-photo--large'))
  nameText.textContent = person.name
  usernameText.textContent = person.username ? `@${person.username}` : ''

  const presence = person.presence
  presenceText.hidden = !presence
  presenceText.textContent = presence?.text ?? ''
  if (presence) presenceText.dataset.presence = presence.kind
  joinCode = presence?.code ?? null
  joinButton.hidden = !joinCode

  showDetails('', null, false)
  if (!dialog.open) dialog.showModal()

  if (!person.username) return
  const current = ++request
  const profile = await loadProfile(person.username)
  if (current !== request || !profile) return

  // "Ingeniería en la Universidad de Chile · 🇨🇱 Chile"
  const { studies, institution, country } = profile
  const place = studies && institution ? `${studies} en ${institution}` : (studies ?? institution)
  const nationality = country ? `${getFlag(country)} ${getCountryName(country)}` : null
  showDetails([place, nationality].filter(Boolean).join(' · '), profile.bio, true)
}
