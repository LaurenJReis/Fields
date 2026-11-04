import axios from 'axios'

// Em produção usa a URL da AWS; em dev usa proxy do Vite (/api → localhost:8080)
const baseURL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Anexa token JWT em toda requisição
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('fieldops_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Trata 401 globalmente — token expirado ou inválido
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('fieldops_token')
      localStorage.removeItem('fieldops_user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api
