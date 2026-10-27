"""Keep provider capabilities and OAuth callbacks out of error/trace telemetry."""
from urllib.parse import urlsplit


def private_storage_url(value):
    if not isinstance(value, str):
        return False
    if value.split(' ', 1)[0] in {'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'}:
        value = value.split(' ', 1)[-1]
    try:
        parsed = urlsplit(value)
    except ValueError:
        return True
    return ('/storage/' in parsed.path or '/media' in parsed.path
            or parsed.hostname in ('oauth2.googleapis.com', 'api.dropboxapi.com', 'content.dropboxapi.com')
            or (parsed.hostname == 'www.googleapis.com' and parsed.path.startswith(('/upload/drive/', '/drive/'))))


def private_storage_record(record):
    data = record.get('data') or {}
    return any(private_storage_url(value) for value in (
        data.get('url'), data.get('http.url'), record.get('description'),
    ))


def scrub_storage_event(event, hint=None):
    if private_storage_url(event.get('request', {}).get('url')):
        return None
    event.get('breadcrumbs', {})['values'] = [
        crumb for crumb in event.get('breadcrumbs', {}).get('values', [])
        if not private_storage_record(crumb)
    ]
    event['spans'] = [span for span in event.get('spans', [])
                      if not private_storage_record(span)]
    return event
