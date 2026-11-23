import dropboxGlyph from '../../assets/providers/dropbox.svg';
import googleDriveLogo from '../../assets/providers/google-drive.png';

// Google Drive's and Dropbox's official marks (see assets/providers/README.md), used only to
// identify the connected provider. The files are shown unmodified; `scale` only evens out how
// much empty margin each file has, so the two marks look the same size. Drive's mark fills 80%
// of its file's height, Dropbox's glyph 53%, so Dropbox is drawn 1.5× larger.
const MARKS = {
    google_drive: { src: googleDriveLogo, scale: 1 },
    dropbox: { src: dropboxGlyph, scale: 1.5 },
};

function StorageProviderIcon({ provider, size = 24, className = '' }) {
    const mark = MARKS[provider];
    if (!mark) return null;
    const drawn = Math.round(size * mark.scale);
    return (
        <span
            className={className}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: size, height: size }}
            aria-hidden="true"
        >
            <img src={mark.src} alt="" width={drawn} height={drawn} draggable="false" style={{ flex: 'none', maxWidth: 'none' }} />
        </span>
    );
}

export default StorageProviderIcon;
