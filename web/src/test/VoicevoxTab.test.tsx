import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import VoicevoxTab from '@/pages/poc/VoicevoxTab'
import { saveSettings } from '@/services/SettingsService'

describe('PoC VoicevoxTab', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.stubEnv('VITE_VOICEVOX_ENDPOINT_POC', 'https://build.test')
    vi.stubEnv('VITE_VOICEVOX_API_KEY_POC', 'build-key')
    fetchMock = vi.fn(async () => new Response('"0.25.1"'))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  const requested = () => fetchMock.mock.calls.map(([url]) => String(url))

  it('tests the endpoint from Settings, which playback uses', async () => {
    saveSettings({ voicevoxEndpoint: 'http://127.0.0.1:50021' })
    render(<VoicevoxTab onResult={() => {}} />)
    expect(screen.getByText('http://127.0.0.1:50021')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'GET /version' }))
    expect(requested()).toEqual(['http://127.0.0.1:50021/version'])
  })

  it('falls back to the build-time endpoint when Settings name none', async () => {
    render(<VoicevoxTab onResult={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'GET /version' }))
    expect(requested()).toEqual(['https://build.test/version'])
  })

  it('does not send the build-time key to an endpoint typed in Settings', async () => {
    saveSettings({ voicevoxEndpoint: 'https://other.test' })
    render(<VoicevoxTab onResult={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /WAV/ }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText(/no API key for this remote endpoint/)).toBeInTheDocument()
  })

  it('picks up an endpoint changed in Settings after the tab opened', async () => {
    render(<VoicevoxTab onResult={() => {}} />)
    saveSettings({ voicevoxEndpoint: 'http://localhost:50021' })
    fireEvent.focus(window)
    expect(screen.getByText('http://localhost:50021')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'GET /version' }))
    expect(requested()).toEqual(['http://localhost:50021/version'])
  })

  it('reports a missing endpoint', async () => {
    vi.stubEnv('VITE_VOICEVOX_ENDPOINT_POC', '')
    render(<VoicevoxTab onResult={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'GET /version' }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText(/No VOICEVOX endpoint/)).toBeInTheDocument()
  })
})
