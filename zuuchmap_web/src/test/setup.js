import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Unmount between tests. Without it a component that writes to document.head
// (useDocumentMeta) or subscribes to something outlives its own test and the
// next one inherits its state.
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

// jsdom implements neither, and both are on the path of code under test.
if (!globalThis.crypto?.randomUUID) {
  globalThis.crypto = { ...globalThis.crypto, randomUUID: () => '0123456789abcdef0123456789abcdef' }
}
