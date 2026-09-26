# Workflow Metrics

How to measure the guided deployment workflow.

HelloDeploy has no analytics service. Funnel measurement rides on the
`audit_events` collection, which is already written on every meaningful action
and is queryable directly in MongoDB. Nothing is sent anywhere else.

## Events the funnel uses

| Action                         | Written when                                     | Metadata                                      |
| ------------------------------ | ------------------------------------------------ | --------------------------------------------- |
| `project.created`              | The owner picks a GitHub project in guided setup | `name`, `slug`                                |
| `project.repository_connected` | A repository is attached                         | `fullName`, `productionBranch`                |
| `project.detection_run`        | The project is analysed                          | `runtimeType`, `issueCount`, `errorCount`     |
| `project.setup_step_completed` | A guided step is confirmed                       | `step` (`analyze`, `identity`, `environment`) |
| `project.readiness_checked`    | The readiness step renders or Publish is pressed | `ready`, `blocking[]`                         |
| `deployment.healthy`           | A release goes live                              | —                                             |
| `deployment.failed`            | A release fails                                  | —                                             |
| `domain.activated`             | A custom domain starts serving                   | —                                             |

`project.created` marks the start of the funnel, because the project row is
created at the moment a repository is chosen.

## Central KPI: time from "Deploy a Website" to a live URL

```js
// Per project: creation → first healthy deployment.
db.audit_events.aggregate([
  { $match: { action: { $in: ['project.created', 'deployment.healthy'] } } },
  { $sort: { createdAt: 1 } },
  {
    $group: {
      _id: '$targetId',
      created: { $min: { $cond: [{ $eq: ['$action', 'project.created'] }, '$createdAt', null] } },
      live: { $min: { $cond: [{ $eq: ['$action', 'deployment.healthy'] }, '$createdAt', null] } },
    },
  },
  { $match: { created: { $ne: null }, live: { $ne: null } } },
  { $project: { minutesToLive: { $divide: [{ $subtract: ['$live', '$created'] }, 60000] } } },
  {
    $group: { _id: null, median: { $median: { input: '$minutesToLive', method: 'approximate' } } },
  },
]);
```

Note `deployment.healthy` records against the deployment, so joining to the
project needs the deployment's `projectId`; the query above is the shape, not a
drop-in.

## Secondary KPI: first-attempt success rate

```js
db.deployments.aggregate([
  { $sort: { projectId: 1, sequenceNumber: 1 } },
  { $group: { _id: '$projectId', firstStatus: { $first: '$status' } } },
  { $group: { _id: '$firstStatus', projects: { $sum: 1 } } },
]);
```

## Where owners drop out

```js
db.audit_events.aggregate([
  { $match: { action: 'project.setup_step_completed' } },
  { $group: { _id: '$metadata.step', projects: { $addToSet: '$targetId' } } },
  { $project: { step: '$_id', reached: { $size: '$projects' } } },
]);
```

Compare each step's count against `project.created` to see where the funnel
loses people.

## Most common readiness failures

```js
db.audit_events.aggregate([
  { $match: { action: 'project.readiness_checked', 'metadata.ready': false } },
  { $unwind: '$metadata.blocking' },
  { $group: { _id: '$metadata.blocking', occurrences: { $sum: 1 } } },
  { $sort: { occurrences: -1 } },
]);
```

## Most common deployment failures

```js
db.deployments.aggregate([
  { $match: { status: 'FAILED', failureCode: { $ne: null } } },
  { $group: { _id: '$failureCode', occurrences: { $sum: 1 } } },
  { $sort: { occurrences: -1 } },
]);
```

## Not measured

The redesign spec lists several events that are deliberately absent, because
nothing would write them truthfully today:

- **`advanced_mode_opened`** — `User.uiMode` records the current preference, not a
  history of switches. A count of accounts per mode is available from the users
  collection; how often someone toggles is not.
- **Per-stage failure rate** — `deployment.stages` records which stage stopped, so
  this is computable from the deployments collection, but no aggregate is
  maintained.
- **Domain completion rate** — `domain.activated` exists, but there is no event for
  abandoning a domain part-way, so a completion _rate_ has no denominator.

Adding these means writing the events first. They are not inferred from what
exists.
