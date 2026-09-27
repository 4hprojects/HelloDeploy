# HTTPS and SSL

URL: `/docs/https-and-ssl`

## SEO Title

`HTTPS and SSL in HelloDeploy | Secure Custom Domains`

## Meta Description

`Learn how HTTPS works for HelloDeploy deployments, what is required before SSL can be configured, and what to check when a certificate is not ready.`

## H1

`HTTPS and SSL`

## Intro

HTTPS encrypts traffic between the user's browser and the deployed website.

## Prerequisites

Before HTTPS can work:

- domain must be added to the correct project
- DNS must point correctly
- domain verification must succeed if required
- SSL provisioning must complete if implemented

## Automatic Certificate Handling

Only state that HelloDeploy automatically creates or renews certificates if verified.

## Checking HTTPS

Expected result:

- page loads over `https://`
- browser shows a secure connection
- certificate matches the domain

## Common Problems

- domain does not resolve
- certificate pending
- wrong project/domain configuration
- root and www differ
- external proxy SSL configuration conflicts

Do not instruct users to disable HTTPS validation as a workaround.
