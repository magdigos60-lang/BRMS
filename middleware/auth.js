/** Login/token checking, role checking and activity logging. */
const jwt = require('jsonwebtoken');
const { supabase, JWT_SECRET } = require('../config/index');

// ==========================================
// MIDDLEWARES (Auth & Role Validation)
// ==========================================
const redirectToLogin = (req, res) => {
  // Remember scanner pages so staff land back on them after logging in
  if (req.method === 'GET' && /^\/(scan|scanner)(\?.*)?$/.test(req.originalUrl)) {
    res.cookie('return_to', req.originalUrl, { httpOnly: true, maxAge: 10 * 60 * 1000 });
  }
  return res.redirect('/login');
};

const authenticateToken = async (req, res, next) => {
  const token = req.cookies.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  if (!token) {
    if (req.accepts('html')) return redirectToLogin(req, res);
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { data: user, error } = await supabase.from('users').select('*').eq('id', decoded.userId).single();
    if (error || !user || user.status !== 'Active') {
      res.clearCookie('token');
      if (req.accepts('html')) return redirectToLogin(req, res);
      return res.status(403).json({ success: false, message: 'User account disabled or invalid.' });
    }
    req.user = user;
    next();
  } catch (err) {
    res.clearCookie('token');
    if (req.accepts('html')) return redirectToLogin(req, res);
    return res.status(403).json({ success: false, message: 'Session expired or invalid.' });
  }
};

const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Unauthorized access for your user role.' });
    }
    next();
  };
};

const logActivity = async (userId, action, details = '', ip = '') => {
  try {
    await supabase.from('user_activity_logs').insert([{ user_id: userId, action, details, ip_address: ip }]);
  } catch (err) {
    console.error('Error writing activity log:', err);
  }
};

module.exports = { authenticateToken, requireRole, logActivity };
