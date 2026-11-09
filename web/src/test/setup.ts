import '@testing-library/jest-dom'
import 'fake-indexeddb/auto'

// jsdom does not implement scrollIntoView
window.HTMLElement.prototype.scrollIntoView = () => {}
