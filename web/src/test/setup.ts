import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

// jsdom does not implement scrollIntoView
window.HTMLElement.prototype.scrollIntoView = () => {}

// jsdom does not implement window.scrollTo
window.scrollTo = (() => {}) as typeof window.scrollTo

// jsdom does not implement Blob.text
Blob.prototype.text ??= function (this: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(this)
  })
}

// jsdom has no PointerEvent, so fireEvent.pointer* would drop clientX and pointerId
if (!('PointerEvent' in window)) {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number
    pointerType: string
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 1
      this.pointerType = init.pointerType ?? 'touch'
    }
  }
  Object.assign(window, { PointerEvent: PointerEventPolyfill })
}
