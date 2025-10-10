import { createRoot } from 'react-dom/client'
import App from './components/App'

const target = document.querySelector('.root')
if (target !== null) {
  createRoot(target).render(<App />)
}
