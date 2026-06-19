import { listSecretNames, setSecret, deleteSecret } from '../services/env-secret.service.js';

export async function getEnvironment(req, res) {
  const project = req.project;
  const secrets = await listSecretNames(project._id);

  res.render('pages/projects/environment', {
    title: `Environment – ${project.name}`,
    project,
    membership: req.membership,
    secrets,
    errors: {},
    values: {},
  });
}

export async function postSetSecret(req, res) {
  const project = req.project;
  const { name, value } = req.body;

  const result = await setSecret(project._id, name?.trim()?.toUpperCase(), value, req.session.user.id, {
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    const secrets = await listSecretNames(project._id);
    return res.render('pages/projects/environment', {
      title: `Environment – ${project.name}`,
      project,
      membership: req.membership,
      secrets,
      errors: { form: result.error },
      values: { name: name ?? '' },
    });
  }

  req.flash('success', `Secret ${name.trim().toUpperCase()} saved.`);
  res.redirect(`/projects/${project.slug}/environment`);
}

export async function postDeleteSecret(req, res) {
  const project = req.project;
  const { name } = req.params;

  const result = await deleteSecret(project._id, name, req.session.user.id, {
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', `Secret ${name} deleted.`);
  }

  res.redirect(`/projects/${project.slug}/environment`);
}
