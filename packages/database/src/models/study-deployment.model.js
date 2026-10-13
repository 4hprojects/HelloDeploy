import mongoose from 'mongoose';

const { Schema } = mongoose;

const studyLogLineSchema = new Schema(
  {
    offsetMs: { type: Number, required: true },
    stage: { type: String, required: true },
    level: { type: String, required: true },
    message: { type: String, required: true, maxlength: 2000 },
  },
  { _id: false },
);

/**
 * Anonymized copy of a finished deployment, kept indefinitely for long-term
 * study after its raw logs expire. It holds no user, project, repository,
 * commit, or deployment identifiers: `studyId` and `studyProjectKey` are
 * random values stored only on the live Deployment and Project, so deleting
 * the project leaves nothing that links these rows back to it.
 */
const studyDeploymentSchema = new Schema(
  {
    studyId: { type: String, required: true },
    studyProjectKey: { type: String, required: true },
    runtimeType: { type: String, default: null },
    triggerType: { type: String, default: null },
    status: { type: String, required: true },
    finalStage: { type: String, default: null },
    failureCode: { type: String, default: null },
    failureSummary: { type: String, default: null, maxlength: 1000 },
    sequenceNumber: { type: Number, default: null },
    day: { type: Date, required: true },
    queueWaitMs: { type: Number, default: null },
    totalMs: { type: Number, default: null },
    stageMs: { type: Map, of: Number, default: () => ({}) },
    logLineCount: { type: Number, default: 0 },
    logs: { type: [studyLogLineSchema], default: () => [] },
  },
  {
    timestamps: true,
    collection: 'study_deployments',
  },
);

studyDeploymentSchema.index({ studyId: 1 }, { unique: true });
studyDeploymentSchema.index({ day: 1 });
studyDeploymentSchema.index({ studyProjectKey: 1, day: 1 });

export const StudyDeployment =
  mongoose.models.StudyDeployment ?? mongoose.model('StudyDeployment', studyDeploymentSchema);
