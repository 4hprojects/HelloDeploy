import { asyncHandler } from '../utils/async-handler.js';
import { getDashboardOverview, getDashboardStatus } from '../services/project-discovery.service.js';

export const getDashboard = asyncHandler(async (req, res) => {
  const overview = await getDashboardOverview(req.session.user.id);
  res.render('pages/dashboard', {
    title: 'Dashboard',
    ...overview,
  });
});

export const getDashboardStatusJson = asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await getDashboardStatus(req.session.user.id, req.query.ids));
});
