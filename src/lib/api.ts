import constants from '../constants';

/**
 * Fetch with authentication helper function
 * Automatically includes the Bearer token from localStorage
 */
export const fetchWithAuth = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const token = localStorage.getItem('token');
  
  const defaultHeaders = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
  };

  const mergedOptions: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  // Construct full URL if it's a relative path
  const fullUrl = url.startsWith('http') ? url : `${constants.baseURL}${url}`;

  return fetch(fullUrl, mergedOptions);
};

/**
 * Helper function to handle API responses with error handling
 */
export const apiRequest = async <T>(url: string, options: RequestInit = {}): Promise<T> => {
  try {
    const response = await fetchWithAuth(url, options);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
};

/**
 * GET request helper
 */
export const apiGet = <T>(url: string): Promise<T> => {
  return apiRequest<T>(url, { method: 'GET' });
};

/**
 * POST request helper
 */
export const apiPost = <T>(url: string, data?: unknown): Promise<T> => {
  return apiRequest<T>(url, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });
};

/**
 * PUT request helper
 */
export const apiPut = <T>(url: string, data?: unknown): Promise<T> => {
  return apiRequest<T>(url, {
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  });
};

/**
 * DELETE request helper
 */
export const apiDelete = <T>(url: string): Promise<T> => {
  return apiRequest<T>(url, { method: 'DELETE' });
};