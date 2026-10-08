# Redrob Privacy

Last updated: October 8, 2026

Redrob opens, edits, and saves documents locally. Document editing does not
upload files to Redrob. AI features require a network connection and send
requests only when you use them.

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

## AI work insights

When Redrob is connected to a Redrob Console workspace, each AI session in
Docs, Sheets, Slides, PDF and Markdown is labeled on this computer and the
labels are sent to that workspace's Redrob Console with the workspace's key.
The console uses them for its AI work insights: each person sees their own
work, team leads their team as a whole, and admins the workspace, never for a
group smaller than the workspace's minimum.

A session is one stretch of work with the AI panel, ending after 15 minutes
with nothing happening. Its labels are:

- the day and time it started, and that it was Redrob Office
- how deep the work went, from a quick question to the agent doing the whole
  task, worked out from how many messages were sent and whether the AI changed
  the file
- whether the AI changed the file, and whether the first message went with the
  open file, a selection or an image
- how many messages were sent, whether the run was stopped, and whether a new
  message followed the stop
- for sessions where the agent did the work: how many steps it took, and the
  minutes it ran and the minutes between its answers and the next message

Each AI request of a session also carries the session's random id, so the
console can match the session to its own record of the request's model and
cost.

Insights never send what you typed, what the AI wrote, the file or any part of
it, file names or paths. Labels wait in `insights-outbox.json` in the app's
data folder until the console accepts them, so you can read exactly what will
be sent.

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
