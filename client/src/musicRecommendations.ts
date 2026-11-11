// Videos de YouTube para quien no sabe qué escuchar. Aparecen en el panel de música, en este orden.
// Para agregar uno, copia su link de YouTube y escribe el título y el canal como quieres que se vean.

export interface MusicRecommendation {
  title: string
  channel: string
  url: string
}

export const MUSIC_RECOMMENDATIONS: MusicRecommendation[] = [
  {
    title: 'relax, everything will be okay',
    channel: 'BeforePhantoms',
    url: 'https://www.youtube.com/watch?v=h8UpC5JbMU0',
  },
  {
    title: 'relax, everything will be okay',
    channel: 'BeforePhantoms',
    url: 'https://www.youtube.com/watch?v=MQK1gFcDJ-I&list=RDMQK1gFcDJ-I&start_radio=1',
  },
  {
    title: 'relax, everything will be okay',
    channel: 'BeforePhantoms',
    url: 'https://www.youtube.com/watch?v=u1cV6nmXOsY&list=RDu1cV6nmXOsY&start_radio=1',
  },
]
