# Authentication Experience Standard

## Objective

HelloDeploy follows a consistent Hello ecosystem authentication pattern derived from the strongest elements of HelloRun and HelloUniversity while keeping platform-specific fields separate.

## Standard Terminology

- `Create Account`
- `Sign In`
- `Forgot Password?`
- `Verify Email`
- `Sign Out`

Do not mix Login, Log In, Sign Up, and Sign In within the same interface.

## Registration Fields

HelloDeploy registration collects:

- First name
- Last name
- Email address
- Password
- Confirm password
- Acceptance of Terms, Privacy Policy, and Acceptable Use Policy
- Cloudflare Turnstile token
- Hidden honeypot field

Do not ask for Owner, Maintainer, Viewer, or platform role during registration. Every verified registrant becomes a normal platform User. Project roles are assigned within projects.

## Password Standard

V1 consistency rule:

- Minimum eight characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- Symbols are allowed
- Password and confirmation must match
- Maximum length must safely support password managers and denial-of-service protection

Do not prohibit special characters. Password rules must be identical on registration and reset forms and enforced server-side.

## Registration Flow

```text
Submit registration
       ↓
Validate fields and Turnstile
       ↓
Create pending-verification account
       ↓
Send verification email through Resend
       ↓
Verify single-use token
       ↓
Activate normal User account
       ↓
Access dashboard and create project draft
```

Account approval is not required for normal users. The first project deployment requires approval.

## Sign-In Flow

```text
Submit email and password
       ↓
Validate credentials
       ↓
Check email verification and account status
       ↓
Rotate and create secure session
       ↓
Redirect by platform role and intended destination
```

Redirects:

- Super Admin: administrative overview or original safe destination
- Admin: review dashboard or original safe destination
- User: project dashboard or original safe destination

Validate return URLs to prevent open redirects.

## Email Verification

- Token is random, hashed in storage, single-use, and expiring.
- Resend action is rate-limited.
- A newer token invalidates or supersedes older tokens according to documented behavior.
- Successful verification creates an audit event.
- Interface provides a clear expired-token recovery action.

## Password Recovery

Use a three-step flow:

1. Enter email address
2. Verify emailed reset code
3. Create new password

Controls:

- Neutral response whether or not the email exists
- Hashed, expiring, single-use code
- Attempt limit and resend cooldown
- Rate limits by account and network indicators
- Reset invalidates other reset codes
- Successful reset may revoke existing sessions according to policy
- Confirmation email after password change

## Authentication Page Layout

Desktop uses a two-panel layout:

```text
Brand and product value panel | Authentication form
```

Mobile uses a single column with compact branding above the form.

The brand panel may include:

- HelloDeploy logo or placeholder
- Short explanation
- Three concise product benefits
- Orange and baby-blue brand accents

The form panel contains only the current authentication task and essential supporting links.

## Shared EJS Structure

```text
apps/web/src/views/
|-- layouts/
|   `-- auth.ejs
|-- partials/
|   |-- auth-brand-panel.ejs
|   |-- form-field.ejs
|   |-- password-field.ejs
|   |-- password-requirements.ejs
|   |-- form-errors.ejs
|   |-- policy-consent.ejs
|   `-- auth-footer.ejs
`-- pages/auth/
    |-- sign-in.ejs
    |-- create-account.ejs
    |-- verify-email.ejs
    |-- forgot-password.ejs
    |-- verify-reset-code.ejs
    `-- new-password.ejs
```

## Form Behavior

- Persistent visible labels
- Appropriate autocomplete attributes
- Show/hide password control with accessible name
- Password requirement checklist
- Inline field errors
- Form-level error summary
- Loading text and disabled submit during processing
- Non-sensitive input preserved after validation errors
- Focus moves to the error summary after failed submission where appropriate
- Success state clearly explains the next action

## GitHub Relationship

GitHub is a repository integration, not the initial HelloDeploy sign-in provider. Users connect a GitHub App installation after signing into HelloDeploy.

Google sign-in is not part of HelloDeploy V1. It may be considered later as an ecosystem-wide decision rather than implemented inconsistently in one new product.

## Security and Privacy

- Secure, HTTP-only, same-site session cookies
- CSRF protection for cookie-authenticated mutations
- Session rotation after authentication and privilege changes
- Generic authentication failures
- No passwords, tokens, reset codes, or secret values in logs
- Audit verification, password changes, session revocation, and account-status changes
- Turnstile remains an abuse control, not a replacement for server validation

## Authentication Definition of Done

- Terminology is consistent across navigation, headings, buttons, emails, and errors.
- Password rules match across registration and recovery.
- Registration, verification, sign-in, recovery, and sign-out work on mobile and desktop.
- Keyboard and screen-reader behavior is tested.
- All sensitive flows are rate-limited and audited.
- No project or platform role can be self-selected during registration.
