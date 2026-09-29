# Getting Started With HelloDeploy

URL: `/docs/getting-started`

## SEO Title

`Getting Started With HelloDeploy | First Deployment Guide`

## Meta Description

`Create your first HelloDeploy project, configure the deployment, add environment variables, deploy the application, and open the live project.`

## H1

`Getting Started With HelloDeploy`

## Intro

This guide walks through the basic HelloDeploy deployment flow. The exact settings depend on the runtime or framework used by the application.

Before continuing, check `/supported-runtimes`.

## Before You Start

You should have:

- a HelloDeploy account
- a supported web application
- access to the project source or supported repository
- required environment variable values
- correct build and start configuration if required

## Step 1: Sign In

Sign in to HelloDeploy using a currently supported authentication method.

Expected result: the HelloDeploy dashboard is available.

## Step 2: Create a Project

Document the exact project creation button and fields after verifying the current UI.

Possible information may include:

- project name
- repository or source
- branch
- runtime
- deployment configuration

Only show fields that exist.

## Step 3: Review Project Configuration

Depending on the project, review:

- build command
- start command
- application port
- environment variables

Related: `/docs/project-configuration`

## Step 4: Add Environment Variables

Add required secret or environment-specific values before deployment.

Related: `/docs/environment-variables`

## Step 5: Start the Deployment

The deployment flow is a guided wizard: choose a source, pick a repository,
let HelloDeploy inspect it, name the website, set environment variables, review
readiness, then publish. Each step states what was detected and what was assumed,
so a wrong guess can be corrected before anything is built.

## Step 6: Review Deployment Status

If deployment fails, open the logs.

Related: `/docs/deployment-logs`

## Step 7: Open the Application

Open the project URL after a successful deployment.

If it does not load, use `/docs/troubleshooting`.

## Step 8: Connect a Custom Domain

Optional. Link: `/docs/custom-domain`

## Step 9: Publish Future Updates

Use the supported redeployment workflow.

Related: `/docs/redeployment`

## Completion Checklist

- [ ] Project created
- [ ] Deployment settings reviewed
- [ ] Environment variables added if required
- [ ] Deployment completed
- [ ] Project URL loads
- [ ] Custom domain configured if needed
- [ ] Redeployment method understood
