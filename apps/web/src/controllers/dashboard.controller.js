import { getUserProjects } from '../services/project.service.js';

export async function getDashboard(req, res) {
  const userProjects = await getUserProjects(req.session.user.id);
  res.render('pages/dashboard', {
    title: 'Dashboard',
    projects: userProjects,
  });
}
