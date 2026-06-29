import { asyncHandler } from '../utils/async-handler.js';
import { getUserProjects } from '../services/project.service.js';

export const getDashboard = asyncHandler(async (req, res) => {
  const userProjects = await getUserProjects(req.session.user.id);
  res.render('pages/dashboard', {
    title: 'Dashboard',
    projects: userProjects,
  });
});
