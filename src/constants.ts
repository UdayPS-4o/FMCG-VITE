const constants = {
  // In development, always target backend server on port 8000
  baseURL: (import.meta.env && import.meta.env.DEV)
    ? 'http://localhost:8000'
    : (import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000')),
};

export default constants;