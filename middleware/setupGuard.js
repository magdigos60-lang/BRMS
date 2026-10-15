/** Redirects to /setup until the first-time setup is completed. */
const { supabase } = require('../config/index');

const setupGuard = async (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/public/')) return next();
  try {
    const { data: settings } = await supabase.from('system_settings').select('*').single();
    if ((!settings || !settings.setup_completed) && req.path !== '/setup') {
      return res.redirect('/setup');
    }
  } catch (e) {
    console.error('Setup Check Error:', e);
  }
  next();
};

module.exports = setupGuard;
