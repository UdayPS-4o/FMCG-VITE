import constants from '../constants';

/**
 * Utility function for making authenticated API requests
 * 
 * @param url - The API endpoint to call
 * @param options - Fetch options
 * @returns Promise with the response data
 */
async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token');
  
  // Set up headers
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  // Add authorization token if available
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });
    
    // Handle 401 Unauthorized responses
    if (response.status === 401) {
      // Clear token and redirect to login
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      throw new Error('Authentication failed');
    }
    
    // Handle other non-200 responses
    if (!response.ok) {
      throw new Error(`API call failed with status: ${response.status}`);
    }
    
    // Parse JSON response if it has content
    if (response.headers.get('content-length') !== '0') {
      return await response.json();
    }
    
    return null;
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

/**
 * Check if the user is authenticated
 * @returns Promise with the user data if authenticated
 */
export async function checkAuth() {
  return fetchWithAuth(`${constants.baseURL}/api/checkIsAuth`);
}

/**
 * Log out the current user
 */
export async function logout() {
  try {
    await fetchWithAuth(`${constants.baseURL}/api/logout`, {
      method: 'POST',
    });
    
    // Clear local storage
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    // Redirect to login
    window.location.href = '/login';
  } catch (error) {
    console.error('Logout failed:', error);
    
    // Still clear local storage and redirect
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }
}

export default {
  fetchWithAuth,
  checkAuth,
  logout
}; 