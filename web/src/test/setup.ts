import '@testing-library/jest-dom'
import 'fake-indexeddb/auto'

// jsdom does not implement scrollIntoView
window.HTMLElement.prototype.scrollIntoView = () => {}

// jsdom does not implement Blob.text
Blob.prototype.text ??= function (this: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(this)
  })
}
