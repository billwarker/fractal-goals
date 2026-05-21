# External Note Attachments

Notes are intentionally text-only in application storage. The legacy `notes.image_data`
database column was removed because embedded base64 image data makes free-tier storage
hard to predict and can quickly dominate account size.

Future image attachment support should store metadata only:

- `note_id`
- provider, such as `google_drive`, `dropbox`, or `one_drive`
- provider file id
- display name
- MIME type
- byte size reported by the provider
- thumbnail URL or provider preview URL when available
- permission/status metadata

The app should not proxy or persist user image bytes. Users should authorize their own
storage provider, and the app should link to provider-owned files.
