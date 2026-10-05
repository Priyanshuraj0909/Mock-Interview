export const API_BASE_URL = (process.env.REACT_APP_API_BASE_URL || '/api').replace(/\/$/, '')

export const generateTest = async (params) => {
  const response = await fetch(`${API_BASE_URL}/generate-test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Failed to generate test')
  }

  return await response.json()
}

export const submitAnswers = async (data) => {
  const response = await fetch(`${API_BASE_URL}/submit-answers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Failed to submit answers')
  }

  return await response.json()
}
