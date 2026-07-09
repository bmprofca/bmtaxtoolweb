import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { APP_NAME, APP_TAGLINE } from '../config/app'
import './Login.css'

function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login(username.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-shell">
        <section className="login-brand" aria-hidden="true">
          <div className="login-brand-mark">BM</div>
          <h1>{APP_NAME}</h1>
          <p>{APP_TAGLINE}</p>
        </section>

        <section className="login-card">
          <div className="login-card-header">
            <h2>Welcome back</h2>
            <p>Sign in with your workspace credentials</p>
          </div>

          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}

          <form className="login-form" onSubmit={handleSubmit} autoComplete="on">
            <label className="login-field">
              <span>Username</span>
              <input
                type="text"
                name="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Your username"
                autoComplete="username"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            </label>

            <label className="login-field">
              <span>Password</span>
              <input
                type="password"
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
                required
              />
            </label>

            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="login-footer">Secure access to your client workspace</p>
        </section>
      </div>
    </div>
  )
}

export default Login
