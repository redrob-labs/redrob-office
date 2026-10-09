# Redrob Privacy

Last updated: August 26, 2026

Redrob opens, edits, and saves documents locally. Document editing does not
upload files to Redrob. AI features require a network connection and send
requests only when you use them.

## AI work labels

When you use Redrob AI, Office labels each AI session on this computer and sends only the labels to your Redrob workspace, so your workspace's insights can count AI work:

- **What is sent:** what kind of work a session was (for example a support reply or a bug fix), whether something was produced, how many turns and tool steps it took, whether it was stopped, and when it started. These go to the Redrob Console through the Redrob engine, with your workspace's key.
- **What is never sent:** what you wrote, what the AI wrote, file names, file contents or anything from your documents. The first instruction of a session is read on this computer to name the kind of work, then dropped.
- **The model:** labeling uses an open model (multilingual-e5-base, about 300 MB). It is downloaded once, from Redrob's GitHub release, after your first AI chat, and checked against a fixed fingerprint before it is used.
- **Where it waits:** labeled sessions wait in `insights-outbox.json` in Office's data folder until they are sent, so you can read exactly what will leave this computer.

## Usage analytics

Usage analytics is enabled by default in packaged official builds, including
the initial app launch before the onboarding notice is shown. Onboarding
explains what is collected and where to turn it off.

You can disable reporting at any time under **Settings → General → Send
anonymous usage statistics**. An explicit opt-out is remembered and stops all
subsequent analytics events.

### Events and parameters

When enabled, the app sends these events:

- `install_first_launch` — marks the first analytics-enabled use of a newly
  assigned anonymous `client_id`; used for retention cohorts
- `app_launch` — no event-specific parameter
- `file_open` — `ext`, the file extension such as `docx` or `xlsx`
- `file_new` — `kind`, one of `docx`, `xlsx`, `pptx`, `md`, or `pdf`
- `login_click` — no event-specific parameter
- `login_success` — no event-specific parameter

Every event includes:

- `app_version`
- `platform`
- `os_version`
- `ui_lang`
- a per-process `session_id` derived from the process start time
- `engagement_time_msec` with the fixed value `100`

When available, the payload also includes `country_id`, the two-letter country
code from the operating system's regional locale. This can differ from the
user's physical location.

The Google Analytics 4 payload also uses a random install UUID as `client_id`.
The country code is sent through GA4's country-only `user_location` field; the
app does not send a city or region. Neither identifier is an account or
email address.

## Network information

Events are sent to Google Analytics 4 using the Measurement Protocol over
HTTPS. As the HTTPS recipient, Google necessarily sees the connection's public
IP address and transport metadata, and may use them for coarse geolocation and
security or spam-abuse processing. Redrob does not add an IP address to the
event payload.

## Data not collected by analytics

Redrob analytics never sends:

- document content
- file names
- file paths
- account identity
- email addresses

The analytics metadata is injected only into packaged official builds and is
not part of this repository. Source builds and forks without that packaged
metadata install a no-op tracker and send no usage analytics; all features work
the same.
