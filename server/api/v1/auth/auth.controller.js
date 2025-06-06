const authService = require('../../../services/auth.service'); // Adjusted path

async function login(req, res) {
  const { mobile, password } = req.body;

  if (!mobile || !password) {
    return res.status(400).json({ success: false, message: 'Mobile and password are required.' });
  }

  try {
    const user = await authService.authenticateUser(mobile, password);

    if (user) {
      const token = authService.generateAuthToken(user);
      if (token) {
        // Structure matches original /api/login response
        return res.status(200).json({
          success: true,
          token: token,
          user: { // Ensure all fields expected by frontend are here
            id: user.id,
            name: user.name,
            username: user.username,
            routeAccess: user.routeAccess,
            powers: user.powers,
            subgroup: user.subgroup, // Legacy field
            subgroups: user.subgroups, // New field
            smCode: user.smCode,
            defaultSeries: user.defaultSeries,
            godownAccess: user.godownAccess,
            canSelectSeries: user.canSelectSeries
          }
        });
      } else {
        // This case might happen if user object was missing id/username for token generation
        console.error('[AuthController] Token generation failed for user:', user.username);
        return res.status(500).json({ success: false, message: 'Login failed: Could not generate token.' });
      }
    } else {
      return res.status(401).json({ success: false, message: 'Invalid mobile number or password.' });
    }
  } catch (error) {
    console.error('[AuthController] Login error:', error);
    return res.status(500).json({ success: false, message: 'Login failed due to a server error.' });
  }
}

async function logout(req, res) {
  // For JWT, server-side logout is minimal. Client is responsible for clearing the token.
  // Optionally, implement token blocklisting here if needed for immediate session invalidation.
  return res.status(200).json({ success: true, message: 'Logged out successfully.' });
}

async function getAuthStatus(req, res) {
  // This controller function assumes that an authentication middleware has already run.
  // If the middleware successfully authenticates the user, it should attach the user object to req.user.
  if (req.user) {
    // req.user should be populated by the auth middleware
    // Ensure all fields expected by frontend are present
    const userForStatus = {
        id: req.user.id,
        name: req.user.name,
        username: req.user.username,
        routeAccess: req.user.routeAccess,
        powers: req.user.powers,
        subgroup: req.user.subgroup, // Legacy
        subgroups: req.user.subgroups,
        smCode: req.user.smCode,
        defaultSeries: req.user.defaultSeries,
        godownAccess: req.user.godownAccess,
        canSelectSeries: req.user.canSelectSeries
    };
    return res.status(200).json({ authenticated: true, user: userForStatus });
  } else {
    // If req.user is not populated, it means the middleware did not authenticate the user.
    // This could be due to no token, invalid token, or other reasons handled by middleware.
    // The middleware should ideally send a 401 response if a token is required but invalid/missing.
    // If this controller is reached without req.user, it implies optional authentication for this route,
    // or the middleware setup needs review.
    return res.status(401).json({ authenticated: false, user: null });
  }
}

module.exports = {
  login,
  logout,
  getAuthStatus,
};
