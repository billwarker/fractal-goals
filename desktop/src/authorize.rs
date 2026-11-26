//! A provider's consent page in the system's sign-in window, which shares the browser's sign-ins and
//! is out of this app's reach.

use std::cell::RefCell;
use std::sync::mpsc;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2::{define_class, msg_send, AllocAnyThread, DefinedClass, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::NSWindow;
use objc2_authentication_services::{
    ASPresentationAnchor, ASWebAuthenticationPresentationContextProviding, ASWebAuthenticationSession,
    ASWebAuthenticationSessionErrorCode,
};
use objc2_foundation::{NSError, NSObject, NSObjectProtocol, NSString, NSURL};
use tauri::{AppHandle, Manager};

use crate::window;

type Ended = Result<Option<String>, String>;

define_class!(
    // SAFETY: NSObject has no subclassing requirements, and Anchor does not implement Drop.
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = Retained<NSWindow>]
    struct Anchor;

    unsafe impl NSObjectProtocol for Anchor {}

    unsafe impl ASWebAuthenticationPresentationContextProviding for Anchor {
        #[unsafe(method_id(presentationAnchorForWebAuthenticationSession:))]
        unsafe fn anchor(&self, _session: &ASWebAuthenticationSession) -> Retained<ASPresentationAnchor> {
            // An NSWindow; the binding types the anchor as its base class.
            Retained::into_super(Retained::into_super(self.ivars().clone()))
        }
    }
);

impl Anchor {
    fn new(window: Retained<NSWindow>, main: MainThreadMarker) -> Retained<Self> {
        let this = Self::alloc(main).set_ivars(window);
        unsafe { msg_send![super(this), init] }
    }
}

thread_local! {
    // The system holds neither weakly-referenced anchor nor session while its window is open.
    static OPEN: RefCell<Option<(Retained<ASWebAuthenticationSession>, Retained<Anchor>)>> = const { RefCell::new(None) };
}

fn start(app: &AppHandle, url: &str, scheme: &str, ended: mpsc::Sender<Ended>) -> Result<(), String> {
    let main = MainThreadMarker::new().ok_or("not on the main thread")?;
    let window = app.get_webview_window(window::MAIN).ok_or("no window")?;
    let pointer = window.ns_window().map_err(|error| error.to_string())? as *mut NSWindow;
    let window = unsafe { Retained::retain(pointer) }.ok_or("no window")?;
    let url = NSURL::URLWithString(&NSString::from_str(url)).ok_or("not a link")?;
    let finish = RcBlock::new(move |url: *mut NSURL, error: *mut NSError| {
        let answer = match (unsafe { url.as_ref() }, unsafe { error.as_ref() }) {
            (Some(url), _) => Ok(url.absoluteString().map(|link| link.to_string())),
            (None, Some(error)) if error.code() != ASWebAuthenticationSessionErrorCode::CanceledLogin.0 => {
                Err(error.localizedDescription().to_string())
            }
            _ => Ok(None),
        };
        let _ = ended.send(answer);
    });
    let anchor = Anchor::new(window, main);
    let started = unsafe {
        #[allow(deprecated)] // its replacement needs macOS 14.4
        let session = ASWebAuthenticationSession::initWithURL_callbackURLScheme_completionHandler(
            ASWebAuthenticationSession::alloc(),
            &url,
            Some(&NSString::from_str(scheme)),
            RcBlock::as_ptr(&finish),
        );
        session.setPresentationContextProvider(Some(ProtocolObject::from_ref(&*anchor)));
        let started = session.start();
        OPEN.with(|open| *open.borrow_mut() = Some((session, anchor)));
        started
    };
    if started {
        Ok(())
    } else {
        Err("The sign-in window could not be opened.".into())
    }
}

/// Resolves to the address the provider ended on, or nothing when the window was closed.
#[tauri::command(async)]
pub fn authorize(app: AppHandle, url: String, callback_scheme: String) -> Ended {
    if !url.starts_with("https://") {
        return Err("Only secure pages can be opened for sign-in.".into());
    }
    let (sender, receiver) = mpsc::channel();
    let failed = sender.clone();
    let opener = app.clone();
    app.run_on_main_thread(move || {
        if let Err(error) = start(&opener, &url, &callback_scheme, sender) {
            let _ = failed.send(Err(error));
        }
    })
    .map_err(|error| error.to_string())?;
    let ended = receiver.recv().unwrap_or(Ok(None));
    let _ = app.run_on_main_thread(|| OPEN.with(|open| *open.borrow_mut() = None));
    ended
}
