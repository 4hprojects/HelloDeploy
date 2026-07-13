import { asyncHandler } from '../utils/async-handler.js';
import {
  listSecretNames,
  setSecret,
  deleteSecret,
  validateSecretName,
  importEnvFile,
  bulkUpdateSecrets,
  revealSecretValue,
} from '../services/env-secret.service.js';

function preventEnvironmentCaching(res) {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
}

export const getEnvironment = asyncHandler(async (req, res) => {
  const project = req.project;
  const secrets = await listSecretNames(project._id);
  preventEnvironmentCaching(res);

  res.render('pages/projects/environment', {
    title: `Environment – ${project.name}`,
    project,
    membership: req.membership,
    secrets,
    errors: {},
    values: {},
    importErrors: {},
    bulkErrors: {},
    bulkValues: {},
    revealedSecrets: {},
    bulkEditMode: req.query.edit === 'all',
  });
});

async function renderEnvironment(
  req,
  res,
  {
    errors = {},
    values = {},
    importErrors = {},
    bulkErrors = {},
    bulkValues = {},
    revealedSecrets = {},
    bulkEditMode,
  },
) {
  const project = req.project;
  const secrets = await listSecretNames(project._id);
  preventEnvironmentCaching(res);
  res.render('pages/projects/environment', {
    title: `Environment – ${project.name}`,
    project,
    membership: req.membership,
    secrets,
    errors,
    values,
    importErrors,
    bulkErrors,
    bulkValues,
    revealedSecrets,
    bulkEditMode: typeof bulkEditMode === 'boolean' ? bulkEditMode : req.query.edit === 'all',
  });
}

function normalizeBulkRows(body) {
  const names = Array.isArray(body?.names) ? body.names : body?.names ? [body.names] : [];
  const values = Array.isArray(body?.values) ? body.values : body?.values ? [body.values] : [];

  return names.map((name, index) => ({
    name: typeof name === 'string' ? name : '',
    value: typeof values[index] === 'string' ? values[index] : '',
  }));
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

export const postImportEnvFile = asyncHandler(async (req, res) => {
  const project = req.project;
  const result = await importEnvFile(project._id, req.body.envFileContent, req.session.user.id, {
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    return renderEnvironment(req, res, { importErrors: { form: result.error } });
  }

  req.flash(
    'success',
    `${result.count} environment variable${result.count === 1 ? '' : 's'} imported.`,
  );
  res.redirect(`/projects/${project.slug}/environment`);
});

export const postBulkUpdateSecrets = asyncHandler(async (req, res) => {
  const project = req.project;
  const bulkRows = normalizeBulkRows(req.body);

  const result = await bulkUpdateSecrets(project._id, bulkRows, req.session.user.id, {
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    return renderEnvironment(req, res, {
      bulkErrors: { form: result.error },
      bulkValues: Object.fromEntries(
        bulkRows.map((row) => [
          typeof row.name === 'string' ? row.name.trim().toUpperCase() : '',
          row.value,
        ]),
      ),
      bulkEditMode: true,
    });
  }

  req.flash('success', `${result.count} secret${result.count === 1 ? '' : 's'} updated.`);
  res.redirect(`/projects/${project.slug}/environment`);
});

export const postRevealSecret = asyncHandler(async (req, res) => {
  const project = req.project;
  const { name } = req.params;

  const result = await revealSecretValue(project._id, name, req.session.user.id, {
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
    return res.redirect(`/projects/${project.slug}/environment`);
  }

  return renderEnvironment(req, res, {
    revealedSecrets: { [result.name]: result.value },
  });
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
