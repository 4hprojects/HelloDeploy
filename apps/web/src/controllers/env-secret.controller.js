import { asyncHandler } from '../utils/async-handler.js';
import {
  listSecretNames,
  setSecret,
  deleteSecret,
  validateSecretName,
} from '../services/env-secret.service.js';

export const getEnvironment = asyncHandler(async (req, res) => {
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
});

async function renderEnvironment(req, res, { errors, values }) {
  const project = req.project;
  const secrets = await listSecretNames(project._id);
  res.render('pages/projects/environment', {
    title: `Environment – ${project.name}`,
    project,
    membership: req.membership,
    secrets,
    errors,
    values,
  });
}

export const postSetSecret = asyncHandler(async (req, res) => {
  const project = req.project;
  const { name, value } = req.body;
  const normalizedName = name?.trim()?.toUpperCase();

  const errors = {};
  const nameError = validateSecretName(normalizedName);
  if (nameError) {
    errors.name = nameError;
  }
  if (!value || typeof value !== 'string') {
    errors.value = 'Secret value is required.';
  }
  if (Object.keys(errors).length > 0) {
    return renderEnvironment(req, res, { errors, values: { name: name ?? '' } });
  }

  const result = await setSecret(project._id, normalizedName, value, req.session.user.id, {
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    return renderEnvironment(req, res, {
      errors: { form: result.error },
      values: { name: name ?? '' },
    });
  }

  req.flash('success', `Secret ${normalizedName} saved.`);
  res.redirect(`/projects/${project.slug}/environment`);
});

export const postDeleteSecret = asyncHandler(async (req, res) => {
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
});
