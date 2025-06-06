const authService = require('../services/auth.service'); // Adjusted path

// Define paths that should bypass JWT authentication.
// Example: '/api/v1/auth/login', '/api/v1/some-public-resource'
// For now, auth routes like login will not use this middleware directly.
// This list is for other globally applied middleware scenarios if any.
const PUBLIC_PATHS = [
  // Add specific public GET routes here if the middleware is applied globally
  // and some /api/v1/ resources are public.
  // For now, /api/v1/auth/login and /api/v1/auth/logout are handled by not applying this middleware.
];

async function authenticateToken(req, res, next) {
  // Allow requests to public paths to proceed without a token
  if (PUBLIC_PATHS.includes(req.path)) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <TOKEN>

  if (token == null) {
    return res.status(401).json({ success: false, message: 'Unauthorized: No token provided.' });
  }

  const decodedPayload = authService.verifyAuthToken(token);

  if (!decodedPayload) {
    return res.status(401).json({ success: false, message: 'Unauthorized: Invalid or expired token.' });
  }

  // Token is valid, try to fetch user details
  try {
    const user = await authService.getUserById(decodedPayload.userId);
    if (!user) {
      // User associated with token not found (e.g., deleted)
      return res.status(401).json({ success: false, message: 'Unauthorized: User not found for token.' });
    }
    req.user = user; // Attach user object to the request
    next();
  } catch (error) {
    console.error('[AuthMiddleware] Error fetching user by ID:', error);
    return res.status(500).json({ success: false, message: 'Server error during authentication.' });
  }
}

module.exports = {
  authenticateToken,
  // Potentially other middleware like authorizeRoles if needed later
};
