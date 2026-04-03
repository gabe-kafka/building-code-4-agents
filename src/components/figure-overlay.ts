import { el } from '../lib/dom.ts'
import { state, on, setOverlay } from '../state.ts'

export function createFigureOverlay(): HTMLElement {
  const overlay = el('div', { className: 'figure-overlay hidden' })

  overlay.addEventListener('click', () => setOverlay(null))

  function render() {
    if (state.overlayFigure) {
      overlay.innerHTML = ''
      overlay.append(el('img', { src: state.overlayFigure, alt: 'Figure' }))
      overlay.classList.remove('hidden')
    } else {
      overlay.classList.add('hidden')
    }
  }

  on('overlay', render)
  render()

  return overlay
}
