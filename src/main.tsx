import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './print/print-standard.css'
import './index.css'
import 'sweetalert2/dist/sweetalert2.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
