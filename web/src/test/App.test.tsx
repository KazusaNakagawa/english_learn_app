import { render, screen } from '@testing-library/react'
import { HashRouter } from 'react-router'
import { describe, it, expect } from 'vitest'
import App from '@/App'

describe('App', () => {
  it('renders the word list page heading', () => {
    render(
      <HashRouter>
        <App />
      </HashRouter>,
    )
    expect(screen.getByText('English Learn App')).toBeInTheDocument()
  })
})
