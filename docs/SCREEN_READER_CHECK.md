# Screen-Reader Check

Updated: 2026-10-22

A guided, 15–20 minute check of the dashboard with a real screen reader. Automated checks (axe in
`npm run test:browser`, plus an accessibility-tree review on 2026-10-22) already confirm that
landmarks, headings, names, and labels exist. This check covers what only a person can judge:
whether the announcements make sense, in a useful order, without confusion. Repeat it after large
UI changes.

## Setup (Ubuntu, Orca)

1. Turn Orca on or off with **Super + Alt + S** (or Settings › Accessibility › Screen Reader).
2. Use Chrome or Firefox, signed in to hellodeploy.online with a normal (non-admin) account that
   owns a project with at least one deployment.
3. Keys you will use. The Orca key is **Insert** (desktop layout) or **Caps Lock** (laptop
   layout).

   | Key                 | Does                                                |
   | ------------------- | --------------------------------------------------- |
   | **Tab / Shift+Tab** | Next / previous link, button, or field              |
   | **H / Shift+H**     | Next / previous heading                             |
   | **1**               | Next level-1 heading (the page title)               |
   | **M / Shift+M**     | Next / previous landmark (banner, navigation, main) |
   | **K**               | Next link                                           |
   | **F**               | Next form field                                     |
   | **Orca + Alt + H**  | List of headings                                    |
   | **Orca + Alt + L**  | List of links                                       |
   | **Orca + A**        | Switch between browse mode and focus mode           |

## What to check

Note anything that is confusing, repeated, silent, or announced in a strange order. "Pass" means
you could do the task by listening alone.

1. **Sign in** (`/auth/sign-in`). Each field announces its label; a wrong password announces the
   error; after signing in, the page title is announced.
2. **Dashboard / Projects.** Press **1**: you hear the page title. Press **M** repeatedly: banner,
   navigation, main, footer. Open the links list (**Orca + Alt + L**): every project link is
   distinguishable. While a deployment is running, its finish is announced on the dashboard.
3. **Project overview.** Headings (**Orca + Alt + H**) describe the sections. Status badges read as words
   ("Healthy", "Failed"), not just colours. A "Last push did not deploy" notice, if present, is
   reachable and readable.
4. **Deployments list.** In the links list, each row's link reads "Logs for deployment #N", and
   Cancel and Retry name their deployment too. Start a deployment and stay on the list: when it
   finishes you hear "Deployment #N: Healthy" (or Failed) without moving focus.
5. **Deployment detail (live logs).** "Live" is announced as a status, and its change when the
   deployment finishes. Log lines are not read aloud as they stream. Tab to the "Deployment logs"
   region and read it with the arrow keys when you want to. The log search field announces its
   label.
6. **Confirmation dialogs.** Cancel or roll back from the Deployments page: focus moves into the
   dialog, its title and message are read, **Escape** closes it, and focus returns to the button
   that opened it.
7. **Settings and Environment.** Every field announces its label and any help text. Saving
   announces success or the validation error next to the field.
8. **Theme and navigation.** The theme toggle announces its state. On a narrow window, the menu
   button announces expanded or collapsed.

## Recording results

Add a dated entry to the [worklog](../WORKLOG.md) with the screen reader and browser versions, a
pass or fail for each numbered check, and the exact announcement for every failure. Turn each
failure into a [Priorities](PRIORITIES.md) item.
