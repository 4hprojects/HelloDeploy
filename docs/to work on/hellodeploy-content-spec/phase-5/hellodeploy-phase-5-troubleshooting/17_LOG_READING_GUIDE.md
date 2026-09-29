# Troubleshooting Log Reading Guide

## Purpose

Provide a reusable diagnostic method for logs.

## Step 1: Identify the Stage

Ask whether failure occurred during:

- dependency installation
- build
- startup
- runtime
- domain routing
- HTTPS

## Step 2: Find the First Meaningful Error

The last line is not always the root cause.

Read several lines before the final failure.

## Step 3: Separate Warning From Error

Warnings may not stop deployment.

Look for:

- exit code
- exception
- missing command
- missing variable
- connection failure
- compilation error

## Step 4: Look for Repetition

Repeated startup messages may indicate a restart loop.

## Step 5: Compare With Local Behavior

Where possible, run the same command locally.

## Step 6: Sanitize Before Sharing

Remove:

- secrets
- tokens
- connection strings
- private URLs
- personal data

## Recommended Log Excerpt Size

Share only the relevant portion around the error.

Do not publish full logs unnecessarily.
