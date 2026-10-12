import { asyncHandler } from '../utils/async-handler.js';
import {
  listSecretNames,
  setSecret,
  deleteSecret,
  deleteAllSecrets,
  validateSecretName,
  importEnvFile,
  previewEnvFile,
  bulkUpdateSecrets,
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
    bulkEditMode: req.query.edit === 'all',
  });
});

async function renderEnvironment(
  req,
  res,
  { errors = {}, values = {}, importErrors = {}, bulkErrors = {}, bulkValues = {}, bulkEditMode },
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

// The review screen posts its per-variable choices as JSON in a hidden field;
// a browser without JavaScript sends none and gets the default choices.
function parseImportSelections(raw) {
  if (raw === undefined || raw === '') {
    return { selections: {} };
  }
  try {
    const selections = JSON.parse(raw);
    if (selections && typeof selections === 'object' && !Array.isArray(selections)) {
      return { selections };
    }
  } catch {
    // Fall through to the shared error below.
  }
  return { error: 'Your import choices could not be read. Choose the file again.' };
}

function describeImport({ count, productionCount, skipped }) {
  const noun = count === 1 ? 'variable' : 'variables';
  const production = productionCount > 0 ? ` (${productionCount} production)` : '';
  const skippedNote = skipped.length > 0 ? ` Skipped without a value: ${skipped.join(', ')}.` : '';
  return `${count} environment ${noun} imported${production}.${skippedNote}`;
}

export const postPreviewEnvFile = asyncHandler(async (req, res) => {
  preventEnvironmentCaching(res);
  const result = previewEnvFile(req.body?.envFileContent);
  if (!result.success) {
    return res.status(400).json({ error: { code: 'INVALID_ENV_FILE', message: result.error } });
  }
  res.json({ entries: result.entries });
});

export const postImportEnvFile = asyncHandler(async (req, res) => {
  const project = req.project;
  const { selections, error } = parseImportSelections(req.body.selections);
  if (error) {
    return renderEnvironment(req, res, { importErrors: { form: error } });
  }

  const result = await importEnvFile(project._id, req.body.envFileContent, req.session.user.id, {
    selections,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    return renderEnvironment(req, res, { importErrors: { form: result.error } });
  }

  req.flash('success', describeImport(result));
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

export const postDeleteAllSecrets = asyncHandler(async (req, res) => {
  const project = req.project;

  const result = await deleteAllSecrets(project._id, req.session.user.id, {
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', `${result.count} secret${result.count === 1 ? '' : 's'} deleted.`);
  }

  res.redirect(`/projects/${project.slug}/environment`);
});
